// Command sync is the auto game tracker's scheduled Lambda. For each opted-in user
// in the given cohort(s), it fetches new Chess.com/Lichess games since the last
// sync, classifies them, and logs qualifying games via
// progressupdate.UpdateProgressAndLog — the same path the manual progress-update
// handler uses, so auto-logged games show up on the heatmap, scoreboard, and
// Activity pie charts identically to manual entries.
//
// Rapid and classical games are logged differently:
//   - Classical games log a +1 count against the existing "Classical Games Played"
//     task (gametracker.ClassicalGamesRequirementId), which drives the heatmap's
//     sword icon and the Dojo Digest email's classical game count.
//   - Rapid games log estimated minutes against a separate, dedicated "Rapid" task
//     (rapidGamesRequirementId) — not "Games + Analysis" — so senseis must create
//     that requirement before enabling this for real cohorts.
//
// v1 is intentionally simple (no checkpointing/continuation, unlike updateRatings):
// it is dark-launched behind gameTrackerAllowlist so real-world load is validated
// with a small set of test accounts before this is revisited for scale.
package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/errors"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/log"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/user/gametracker"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/user/progress/progressupdate"
)

// unmarshalDetail decodes the CloudWatch event's detail payload into req.
func unmarshalDetail(event Event, req *syncRequest) error {
	if err := json.Unmarshal(event.Detail, req); err != nil {
		return errors.Wrap(500, "Temporary server error", "Failed to unmarshal event detail", err)
	}
	return nil
}

type Event events.CloudWatchEvent

type syncRequest struct {
	Cohorts []database.DojoCohort `json:"cohorts"`
}

// rapidGamesRequirementId is the requirement id for the dedicated "Rapid" task that
// rapid games log minutes against. Unlike classical games (which use the existing,
// stable ClassicalGamesRequirementId), no such requirement exists yet — a sensei
// must create one and this env var must be set to its id before rapid games will
// be logged.
var rapidGamesRequirementId = os.Getenv("RAPID_GAMES_REQUIREMENT_ID")

// firstSyncBackfillCap bounds how far back a user's very first sync looks, so
// opting in doesn't flood their heatmap/points in one run.
const firstSyncBackfillDays = 7
const firstSyncBackfillMaxGames = 20

// maxGamesPerSync bounds the number of games fetched from Lichess per platform per
// run, mirroring the first-sync cap for steady-state safety too.
const maxGamesPerSync = 100

type repository interface {
	database.UserProgressUpdater
	ListGameTrackerUsersPage(cohort database.DojoCohort, startKey string, limit int64) ([]*database.User, string, error)
}

var repo repository = database.DynamoDB

// gameTrackerAllowlist restricts the dark launch to specific usernames. A nil map
// (unset env var) means "no one" — the job intentionally no-ops until explicitly
// configured with test accounts.
var gameTrackerAllowlist = parseAllowlist(os.Getenv("GAME_TRACKER_ALLOWLIST"))

func parseAllowlist(raw string) map[string]bool {
	if raw == "" {
		return nil
	}
	allowlist := make(map[string]bool)
	for _, username := range strings.Split(raw, ",") {
		username = strings.TrimSpace(username)
		if username != "" {
			allowlist[username] = true
		}
	}
	return allowlist
}

func Handler(ctx context.Context, event Event) error {
	log.SetRequestId(event.ID)
	log.Infof("Event: %#v", event)

	if len(gameTrackerAllowlist) == 0 {
		log.Info("Game tracker allowlist is empty; nothing to sync")
		return nil
	}

	var req syncRequest
	if err := unmarshalDetail(event, &req); err != nil {
		log.Errorf("Failed to unmarshal request: %v", err)
		return err
	}

	classicalRequirement, err := repo.GetRequirement(gametracker.ClassicalGamesRequirementId)
	if err != nil {
		log.Errorf("Failed to fetch Classical Games Played requirement: %v", err)
		return err
	}

	var rapidRequirement *database.Requirement
	if rapidGamesRequirementId != "" {
		rapidRequirement, err = repo.GetRequirement(rapidGamesRequirementId)
		if err != nil {
			log.Errorf("Failed to fetch Rapid requirement: %v", err)
			return err
		}
	} else {
		log.Error("RAPID_GAMES_REQUIREMENT_ID is not configured; rapid games will not be logged")
	}

	tasks := syncTasks{classical: classicalRequirement, rapid: rapidRequirement}

	for _, cohort := range req.Cohorts {
		if err := syncCohort(cohort, tasks); err != nil {
			log.Errorf("Failed to sync cohort %s: %v", cohort, err)
			return err
		}
	}
	return nil
}

// syncTasks holds the two requirements auto-logged games are written against.
// rapid is nil until RAPID_GAMES_REQUIREMENT_ID is configured; classical is always
// present since it uses the fixed, real ClassicalGamesRequirementId.
type syncTasks struct {
	classical *database.Requirement
	rapid     *database.Requirement
}

func syncCohort(cohort database.DojoCohort, tasks syncTasks) error {
	startKey := ""
	for {
		users, nextKey, err := repo.ListGameTrackerUsersPage(cohort, startKey, 0)
		if err != nil {
			return err
		}

		for _, user := range users {
			if !gameTrackerAllowlist[user.Username] {
				continue
			}
			syncUser(user, tasks)
		}

		if nextKey == "" {
			break
		}
		startKey = nextKey
	}
	return nil
}

func syncUser(user *database.User, tasks syncTasks) {
	for system, setting := range user.GameTrackerSettings {
		if setting == nil || !setting.Enabled {
			continue
		}
		if system != database.Chesscom && system != database.Lichess {
			continue
		}

		username := ""
		if rating := user.Ratings[system]; rating != nil {
			username = strings.TrimSpace(rating.Username)
		}
		if username == "" {
			continue
		}

		if err := syncPlatform(user, system, username, setting, tasks); err != nil {
			log.Errorf("Failed to sync %s for %s: %v", system, user.Username, err)
		}
	}
}

func syncPlatform(
	user *database.User,
	system database.RatingSystem,
	username string,
	setting *database.GameTrackerSetting,
	tasks syncTasks,
) error {
	isFirstSync := setting.LastSyncedAt == ""
	since, err := syncWindowStart(setting)
	if err != nil {
		return err
	}

	games, err := fetchGames(system, username, since, isFirstSync)
	if err != nil {
		return err
	}
	if len(games) == 0 {
		return nil
	}

	source := strings.ToLower(string(system))
	latestGameId := setting.LastSyncedGameId
	latestSyncedAt := setting.LastSyncedAt

	// The classification's cohort-threshold lookup only needs a requirement to read
	// TimeControlThresholds from; the classical requirement is always present, so
	// it doubles as that source regardless of which task a game is ultimately
	// logged against.
	for _, game := range games {
		if !game.Rated {
			continue
		}

		class := gametracker.ClassifyGame(game.BaseSeconds, game.IncrementSeconds, user.DojoCohort, tasks.classical)
		switch class {
		case gametracker.Classical:
			if err := logClassicalGame(user, tasks.classical, game, source); err != nil {
				log.Errorf("Failed to log classical game %s for %s: %v", game.Id, user.Username, err)
			}
		case gametracker.Rapid:
			if tasks.rapid == nil {
				log.Infof("Skipping rapid game %s for %s: no rapid requirement configured", game.Id, user.Username)
			} else if err := logRapidGame(user, tasks.rapid, game, source); err != nil {
				log.Errorf("Failed to log rapid game %s for %s: %v", game.Id, user.Username, err)
			}
		}

		// Advance the watermark for every game processed (qualifying or not), so
		// bullet/blitz games aren't re-fetched on the next run.
		latestGameId = game.Id
		latestSyncedAt = game.EndTime.Format(time.RFC3339)
	}

	update := &database.UserUpdate{
		GameTrackerSettings: &map[database.RatingSystem]*database.GameTrackerSetting{
			system: {
				Enabled:          setting.Enabled,
				EnabledAt:        setting.EnabledAt,
				LastSyncedAt:     latestSyncedAt,
				LastSyncedGameId: latestGameId,
			},
		},
	}
	_, err = repo.UpdateUser(user.Username, update)
	return err
}

func syncWindowStart(setting *database.GameTrackerSetting) (time.Time, error) {
	if setting.LastSyncedAt == "" {
		return time.Now().AddDate(0, 0, -firstSyncBackfillDays), nil
	}
	return time.Parse(time.RFC3339, setting.LastSyncedAt)
}

// fetchGames fetches new games for the given platform/username since the last
// sync. isFirstSync caps Chess.com results to firstSyncBackfillMaxGames, since
// (unlike Lichess) it has no server-side max-games parameter.
func fetchGames(system database.RatingSystem, username string, since time.Time, isFirstSync bool) ([]gametracker.FetchedGame, error) {
	switch system {
	case database.Lichess:
		return gametracker.FetchLichessGames(username, since, maxGamesPerSync)
	case database.Chesscom:
		games, err := gametracker.FetchChesscomGames(username, since)
		if err != nil {
			return nil, err
		}
		if isFirstSync && len(games) > firstSyncBackfillMaxGames {
			games = games[:firstSyncBackfillMaxGames]
		}
		return games, nil
	default:
		return nil, nil
	}
}

// previousCount returns the user's current count for requirement, respecting
// whether it is tracked per-cohort or across all cohorts (AllCohorts).
func previousCount(user *database.User, requirement *database.Requirement) int {
	progress := user.Progress[requirement.Id]
	if progress == nil {
		return 0
	}
	if requirement.GetNumberOfCohorts() == 1 || requirement.GetNumberOfCohorts() == 0 {
		return progress.Counts[database.AllCohorts]
	}
	return progress.Counts[user.DojoCohort]
}

// logClassicalGame logs a +1 count against the Classical Games Played task. This
// task is count-based (games played, not minutes), and drives the heatmap's sword
// icon and the Dojo Digest email's classical game count.
func logClassicalGame(user *database.User, requirement *database.Requirement, game gametracker.FetchedGame, source string) error {
	previous := previousCount(user, requirement)

	_, _, err := progressupdate.UpdateProgressAndLog(repo, user, requirement, &progressupdate.Request{
		RequirementId: requirement.Id,
		Cohort:        user.DojoCohort,
		PreviousCount: previous,
		NewCount:      previous + 1,
		Date:          game.EndTime.Format(time.RFC3339),
		GameInfo: &database.TimelineGameInfo{
			Id:         game.Id,
			AutoLogged: true,
			Source:     source,
		},
	})
	return err
}

// logRapidGame logs the game's estimated minutes against the dedicated Rapid task.
func logRapidGame(user *database.User, requirement *database.Requirement, game gametracker.FetchedGame, source string) error {
	minutes := gametracker.EstimateGameSeconds(game.BaseSeconds, game.IncrementSeconds) / 60
	if minutes <= 0 {
		minutes = 1
	}

	previous := previousCount(user, requirement)

	_, _, err := progressupdate.UpdateProgressAndLog(repo, user, requirement, &progressupdate.Request{
		RequirementId:           requirement.Id,
		Cohort:                  user.DojoCohort,
		PreviousCount:           previous,
		NewCount:                previous + minutes,
		IncrementalMinutesSpent: minutes,
		Date:                    game.EndTime.Format(time.RFC3339),
		GameInfo: &database.TimelineGameInfo{
			Id:         game.Id,
			AutoLogged: true,
			Source:     source,
		},
	})
	return err
}

func main() {
	lambda.Start(Handler)
}
