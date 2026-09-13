// Command trydry is a local, AWS-free way to try the auto game tracker's
// fetch + classify logic against a real Chess.com or Lichess account. It makes
// real network calls to the public Chess.com/Lichess APIs but never touches
// AWS/DynamoDB and never writes anything anywhere — it only prints what the
// sync job would have logged.
//
// Usage:
//
//	go run ./user/gametracker/cmd/trydry -platform=lichess -username=DrNykterstein -days=7
//	go run ./user/gametracker/cmd/trydry -platform=chesscom -username=Hikaru -days=7 -cohort=2400+
package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/user/gametracker"
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

	// No custom TimeControlThresholds configured here, so this uses
	// database.DefaultTimeControlThresholds — the same fallback the real job
	// uses for any cohort without admin-configured thresholds.
	requirement := &database.Requirement{}

	var totalLoggedMinutes int
	var loggedCount, skippedCount int

	for _, g := range games {
		class := gametracker.ClassifyGame(g.BaseSeconds, g.IncrementSeconds, database.DojoCohort(*cohort), requirement)
		estimatedSeconds := gametracker.EstimateGameSeconds(g.BaseSeconds, g.IncrementSeconds)
		minutes := estimatedSeconds / 60

		ratedNote := ""
		if !g.Rated {
			ratedNote = " (unrated, would be skipped)"
		}

		willLog := g.Rated && (class == gametracker.Rapid || class == gametracker.Classical)
		action := "SKIP"
		if willLog {
			action = "LOG "
			totalLoggedMinutes += minutes
			loggedCount++
		} else {
			skippedCount++
		}

		fmt.Printf("[%s] %s  id=%-20s  tc=%d+%d  ~%dmin  class=%-9s%s\n",
			action, g.EndTime.Format("2006-01-02 15:04"), g.Id, g.BaseSeconds, g.IncrementSeconds, minutes, class, ratedNote)
	}

	fmt.Printf("\n%d games would be logged, %d skipped (bullet/blitz/unrated), totaling ~%d minutes on Games + Analysis.\n",
		loggedCount, skippedCount, totalLoggedMinutes)
}
