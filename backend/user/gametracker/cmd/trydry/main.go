// Command trydry is a local, AWS-free way to try the auto game tracker's
// fetch + classify + log logic against a real Chess.com or Lichess account. It
// makes real network calls to the public Chess.com/Lichess APIs but never touches
// AWS/DynamoDB and never writes anything anywhere — it only prints what the
// sync job would have logged.
//
// Usage:
//
//	go run ./user/gametracker/cmd/trydry -platform=lichess -username=DrNykterstein -days=7
//	go run ./user/gametracker/cmd/trydry -platform=chesscom -username=Hikaru -days=7 -cohort=2400+
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/user/gametracker"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/user/progress/progressupdate"
)

func main() {
	platform := flag.String("platform", "", "\"lichess\" or \"chesscom\" (required)")
	username := flag.String("username", "", "the platform username to fetch games for (required)")
	days := flag.Int("days", 7, "how many days back to look (matches the real first-sync cap)")
	cohort := flag.String("cohort", "1500-1600", "Dojo cohort, used to pick time control thresholds")
	flag.Parse()

	if *platform == "" || *username == "" {
		fmt.Println("Usage: go run ./user/gametracker/cmd/trydry -platform=lichess|chesscom -username=<name> [-days=7] [-cohort=1500-1600]")
		os.Exit(1)
	}

	since := time.Now().AddDate(0, 0, -*days)

	var games []gametracker.FetchedGame
	var err error
	switch *platform {
	case "lichess":
		games, err = gametracker.FetchLichessGames(*username, since, 200)
	case "chesscom":
		games, err = gametracker.FetchChesscomGames(*username, since)
	default:
		fmt.Printf("unknown platform %q; must be \"lichess\" or \"chesscom\"\n", *platform)
		os.Exit(1)
	}
	if err != nil {
		fmt.Printf("Failed to fetch games: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Fetched %d games for %s (%s) since %s\n\n", len(games), *username, *platform, since.Format("2006-01-02"))

	dojoCohort := database.DojoCohort(*cohort)

	// No custom TimeControlThresholds configured here, so this uses
	// database.DefaultTimeControlThresholds — the same fallback the real job uses
	// for any cohort without admin-configured thresholds. Its id matches the real
	// production "Classical Games Played" requirement.
	classicalRequirement := &database.Requirement{
		Id:              gametracker.ClassicalGamesRequirementId,
		Name:            "Classical Games Played",
		Category:        "Games + Analysis",
		Counts:          map[database.DojoCohort]int{dojoCohort: 100000},
		NumberOfCohorts: 1,
		UnitScore:       1,
	}

	// Rapid games have no real production requirement yet (a sensei must create
	// one), so this is a representative placeholder for demo purposes only.
	rapidRequirement := &database.Requirement{
		Id:                "rapid-games-demo",
		Name:              "Rapid Games Played",
		Category:          "Games + Analysis",
		ScoreboardDisplay: database.ProgressBar,
		ProgressBarSuffix: " minutes",
		Counts:            map[database.DojoCohort]int{dojoCohort: 100000},
		NumberOfCohorts:   1,
		UnitScore:         0.1,
	}

	user := &database.User{
		Username:    *username,
		DisplayName: *username,
		DojoCohort:  dojoCohort,
	}
	repo := newFakeRepository(user)
	source := *platform

	var totalLoggedMinutes, classicalGamesLogged, rapidGamesLogged, skippedCount int

	for _, g := range games {
		class := gametracker.ClassifyGame(g.BaseSeconds, g.IncrementSeconds, dojoCohort, classicalRequirement)
		estimatedSeconds := gametracker.EstimateGameSeconds(g.BaseSeconds, g.IncrementSeconds)
		minutes := estimatedSeconds / 60
		if minutes <= 0 {
			minutes = 1
		}

		ratedNote := ""
		if !g.Rated {
			ratedNote = " (unrated, would be skipped)"
		}

		action := "SKIP"
		if g.Rated && class == gametracker.Classical {
			action = "LOG classical (+1 game)"
			classicalGamesLogged++
			if err := logClassical(repo, user, classicalRequirement, g, source); err != nil {
				fmt.Printf("Failed to log classical game %s: %v\n", g.Id, err)
			}
		} else if g.Rated && class == gametracker.Rapid {
			action = fmt.Sprintf("LOG rapid (+%dmin)", minutes)
			rapidGamesLogged++
			totalLoggedMinutes += minutes
			if err := logRapid(repo, user, rapidRequirement, g, source, minutes); err != nil {
				fmt.Printf("Failed to log rapid game %s: %v\n", g.Id, err)
			}
		} else {
			skippedCount++
		}

		fmt.Printf("[%-24s] %s  id=%-20s  tc=%d+%d  ~%dmin  class=%-9s%s\n",
			action, g.EndTime.Format("2006-01-02 15:04"), g.Id, g.BaseSeconds, g.IncrementSeconds, minutes, class, ratedNote)
	}

	fmt.Printf("\n%d classical games logged (+1 each to Classical Games Played), %d rapid games logged (~%d total minutes to Rapid), %d skipped (bullet/blitz/unrated).\n",
		classicalGamesLogged, rapidGamesLogged, totalLoggedMinutes, skippedCount)

	printEntries(repo, "Classical Games Played", gametracker.ClassicalGamesRequirementId)
	printEntries(repo, "Rapid", rapidRequirement.Id)
}

func logClassical(repo *fakeRepository, user *database.User, requirement *database.Requirement, g gametracker.FetchedGame, source string) error {
	previous := 0
	if progress := user.Progress[requirement.Id]; progress != nil {
		previous = progress.Counts[database.AllCohorts]
	}
	_, _, err := progressupdate.UpdateProgressAndLog(repo, user, requirement, &progressupdate.Request{
		RequirementId: requirement.Id,
		Cohort:        user.DojoCohort,
		PreviousCount: previous,
		NewCount:      previous + 1,
		Date:          g.EndTime.Format(time.RFC3339),
		GameInfo:      &database.TimelineGameInfo{Id: g.Id, AutoLogged: true, Source: source},
	})
	return err
}

func logRapid(repo *fakeRepository, user *database.User, requirement *database.Requirement, g gametracker.FetchedGame, source string, minutes int) error {
	previous := 0
	if progress := user.Progress[requirement.Id]; progress != nil {
		previous = progress.Counts[database.AllCohorts]
	}
	_, _, err := progressupdate.UpdateProgressAndLog(repo, user, requirement, &progressupdate.Request{
		RequirementId:           requirement.Id,
		Cohort:                  user.DojoCohort,
		PreviousCount:           previous,
		NewCount:                previous + minutes,
		IncrementalMinutesSpent: minutes,
		Date:                    g.EndTime.Format(time.RFC3339),
		GameInfo:                &database.TimelineGameInfo{Id: g.Id, AutoLogged: true, Source: source},
	})
	return err
}

func printEntries(repo *fakeRepository, label, requirementId string) {
	var last *database.TimelineEntry
	for _, entry := range repo.timelineEntries {
		if entry.RequirementId == requirementId {
			last = entry
		}
	}
	if last == nil {
		return
	}
	fmt.Printf("\n--- Example %s TimelineEntry (most recent) ---\n", label)
	encoded, _ := json.MarshalIndent(last, "", "  ")
	fmt.Println(string(encoded))
	fmt.Println(strings.Repeat("-", 60))
}
