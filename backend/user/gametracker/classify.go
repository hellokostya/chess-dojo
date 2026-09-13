// Package gametracker classifies games fetched from Chess.com/Lichess into bullet,
// blitz, rapid, or classical, using cohort-specific thresholds, for the automatic
// game tracker.
package gametracker

import "github.com/jackstenglein/chess-dojo-scheduler/backend/database"

// GameClass is the result of classifying a single game's time control.
type GameClass string

const (
	Bullet    GameClass = "BULLET"
	Blitz     GameClass = "BLITZ"
	Rapid     GameClass = "RAPID"
	Classical GameClass = "CLASSICAL"
)

// incrementWeightSeconds is the standard FIDE/Lichess weight applied to a time
// control's increment when estimating total game length.
const incrementWeightSeconds = 40

// EstimateGameSeconds returns the estimated total length of a game, in seconds,
// given its base time and increment (both in seconds), using the standard
// FIDE/Lichess estimate: base + 40 * increment.
func EstimateGameSeconds(baseSeconds, incrementSeconds int) int {
	return baseSeconds + incrementWeightSeconds*incrementSeconds
}

// ClassifyGame classifies a game as bullet, blitz, rapid, or classical, based on its
// estimated length and the given cohort's time control thresholds (as configured on
// the provided task, typically the "Games + Analysis" requirement).
func ClassifyGame(baseSeconds, incrementSeconds int, cohort database.DojoCohort, task database.Task) GameClass {
	estimatedSeconds := EstimateGameSeconds(baseSeconds, incrementSeconds)

	if estimatedSeconds < database.BulletCeilingSeconds {
		return Bullet
	}

	threshold := task.GetTimeControlThreshold(cohort)

	if estimatedSeconds < threshold.RapidSeconds {
		return Blitz
	}
	if estimatedSeconds < threshold.ClassicalSeconds {
		return Rapid
	}
	return Classical
}
