package gametracker

import (
	"bufio"
	"encoding/json"
	stderrors "errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/errors"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
)

var client = http.Client{Timeout: 30 * time.Second}

var chesscomHost = "https://api.chess.com"
var lichessHost = "https://lichess.org"

const chesscomUserAgent = "ChessDojo game tracker (https://www.chessdojo.club)"

// ErrGameFetchNotFound indicates the platform reports no account/games for the
// given username (including a Chess.com private profile, which 403s).
var ErrGameFetchNotFound = stderrors.New("username not found or games not accessible")

// FetchedGame is a single game pulled from Chess.com/Lichess, reduced to the fields
// the game tracker needs to classify and log it.
type FetchedGame struct {
	// Id uniquely identifies the game on its platform.
	Id string
	// EndTime is when the game finished.
	EndTime time.Time
	// BaseSeconds is the time control's starting clock, in seconds.
	BaseSeconds int
	// IncrementSeconds is the time control's per-move increment, in seconds.
	IncrementSeconds int
	// Rated is whether the game was rated.
	Rated bool
}

type lichessGame struct {
	Id         string `json:"id"`
	Rated      bool   `json:"rated"`
	CreatedAt  int64  `json:"createdAt"`
	LastMoveAt int64  `json:"lastMoveAt"`
	Clock      struct {
		Initial   int `json:"initial"`
		Increment int `json:"increment"`
	} `json:"clock"`
}

// FetchLichessGames fetches the given user's games created after since, oldest games
// first, using Lichess's NDJSON games export endpoint. max caps the number of games
// requested (Lichess also enforces its own limit).
func FetchLichessGames(username string, since time.Time, max int) ([]FetchedGame, error) {
	url := fmt.Sprintf("%s/api/games/user/%s?since=%d&max=%d&sort=dateAsc", lichessHost, username, since.UnixMilli(), max)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to create lichess games request", err)
	}
	req.Header.Set("Accept", "application/x-ndjson")

	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to fetch lichess games", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, errors.Wrap(404, "Invalid request: lichess user not found", "", ErrGameFetchNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New(400, fmt.Sprintf("Invalid request: lichess returned status `%d` for games export", resp.StatusCode), "")
	}

	var games []FetchedGame
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var g lichessGame
		if err := json.Unmarshal(line, &g); err != nil {
			return nil, errors.Wrap(500, "Temporary server error", "Failed to decode lichess game", err)
		}
		games = append(games, FetchedGame{
			Id:               g.Id,
			EndTime:          time.UnixMilli(g.LastMoveAt),
			BaseSeconds:      g.Clock.Initial,
			IncrementSeconds: g.Clock.Increment,
			Rated:            g.Rated,
		})
	}
	if err := scanner.Err(); err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to read lichess games response", err)
	}

	return games, nil
}

type chesscomArchivesResponse struct {
	Archives []string `json:"archives"`
}

type chesscomGamesResponse struct {
	Games []struct {
		Url         string `json:"url"`
		EndTime     int64  `json:"end_time"`
		Rated       bool   `json:"rated"`
		TimeControl string `json:"time_control"`
	} `json:"games"`
}

// FetchChesscomGames fetches the given user's games from all monthly archives that
// could contain games after since. Chess.com has no server-side "since" filter, so
// games at or before since are filtered out client-side.
func FetchChesscomGames(username string, since time.Time) ([]FetchedGame, error) {
	archivesUrl := fmt.Sprintf("%s/pub/player/%s/games/archives", chesscomHost, username)
	req, err := http.NewRequest(http.MethodGet, archivesUrl, nil)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to create chess.com archives request", err)
	}
	req.Header.Set("User-Agent", chesscomUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to fetch chess.com archives", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden {
		// A private profile 403s here; treat the same as not-found so the caller
		// can skip this user gracefully rather than failing the whole batch.
		return nil, errors.Wrap(404, fmt.Sprintf("Invalid request: chess.com returned status `%d` for player archives", resp.StatusCode), "", ErrGameFetchNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New(400, fmt.Sprintf("Invalid request: chess.com returned status `%d` for player archives", resp.StatusCode), "")
	}

	var archives chesscomArchivesResponse
	if err := json.NewDecoder(resp.Body).Decode(&archives); err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to decode chess.com archives", err)
	}

	// Only the current and since's month archives can contain new games; earlier
	// archives are immutable once the month has passed.
	relevantArchives := relevantChesscomArchives(archives.Archives, since)

	var games []FetchedGame
	for _, archiveUrl := range relevantArchives {
		monthGames, err := fetchChesscomArchive(archiveUrl)
		if err != nil {
			return nil, err
		}
		for _, g := range monthGames {
			if !g.EndTime.After(since) {
				continue
			}
			games = append(games, g)
		}
	}
	return games, nil
}

// relevantChesscomArchives returns the archive URLs for the month containing since
// and every month after it, assuming archives are ordered oldest-first as Chess.com
// returns them.
func relevantChesscomArchives(archives []string, since time.Time) []string {
	cutoff := since.Format("2006/01")
	var relevant []string
	for _, archiveUrl := range archives {
		if len(archiveUrl) < len(cutoff) {
			continue
		}
		if archiveUrl[len(archiveUrl)-len(cutoff):] >= cutoff {
			relevant = append(relevant, archiveUrl)
		}
	}
	return relevant
}

func fetchChesscomArchive(archiveUrl string) ([]FetchedGame, error) {
	req, err := http.NewRequest(http.MethodGet, archiveUrl, nil)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to create chess.com archive request", err)
	}
	req.Header.Set("User-Agent", chesscomUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to fetch chess.com archive", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New(400, fmt.Sprintf("Invalid request: chess.com returned status `%d` for archive", resp.StatusCode), "")
	}

	var parsed chesscomGamesResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, errors.Wrap(500, "Temporary server error", "Failed to decode chess.com archive", err)
	}

	games := make([]FetchedGame, 0, len(parsed.Games))
	for _, g := range parsed.Games {
		base, increment := parseChesscomTimeControl(g.TimeControl)
		games = append(games, FetchedGame{
			Id:               g.Url,
			EndTime:          time.Unix(g.EndTime, 0),
			BaseSeconds:      base,
			IncrementSeconds: increment,
			Rated:            g.Rated,
		})
	}
	return games, nil
}

// parseChesscomTimeControl parses Chess.com's "base+increment" or "base" time
// control string (e.g. "600+5", "600"). Daily/correspondence controls (e.g.
// "1/86400") are detected by the "/" separator and always treated as
// classical-length, since Sscanf's "%d" would otherwise silently match just their
// leading digit and misclassify them as bullet.
func parseChesscomTimeControl(tc string) (base int, increment int) {
	if strings.Contains(tc, "/") {
		return database.DefaultTimeControlThresholds.ClassicalSeconds, 0
	}

	var b, i int
	if n, err := fmt.Sscanf(tc, "%d+%d", &b, &i); err == nil && n == 2 {
		return b, i
	}
	if n, err := fmt.Sscanf(tc, "%d", &b); err == nil && n == 1 {
		return b, 0
	}
	return database.DefaultTimeControlThresholds.ClassicalSeconds, 0
}
