package gametracker

import (
	"testing"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
)

const testCohort = database.DojoCohort("1500-1600")
const otherCohort = database.DojoCohort("2000-2100")

func newTestRequirement() *database.Requirement {
	return &database.Requirement{
		TimeControlThresholds: map[database.DojoCohort]database.TimeControlThreshold{
			testCohort: {RapidSeconds: 600, ClassicalSeconds: 1800},
		},
	}
}

func TestClassifyGame(t *testing.T) {
	req := newTestRequirement()

	tests := []struct {
		name             string
		baseSeconds      int
		incrementSeconds int
		cohort           database.DojoCohort
		want             GameClass
	}{
		{
			name:             "well below bullet ceiling",
			baseSeconds:      60,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Bullet,
		},
		{
			name:             "exactly at bullet ceiling minus one",
			baseSeconds:      database.BulletCeilingSeconds - 1,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Bullet,
		},
		{
			name:             "exactly at bullet ceiling is not bullet",
			baseSeconds:      database.BulletCeilingSeconds,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Blitz,
		},
		{
			name:             "just below rapid threshold is blitz",
			baseSeconds:      599,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Blitz,
		},
		{
			name:             "exactly at rapid threshold is rapid",
			baseSeconds:      600,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Rapid,
		},
		{
			name:             "just below classical threshold is rapid",
			baseSeconds:      1799,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Rapid,
		},
		{
			name:             "exactly at classical threshold is classical",
			baseSeconds:      1800,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Classical,
		},
		{
			name:             "well above classical threshold is classical",
			baseSeconds:      5400,
			incrementSeconds: 0,
			cohort:           testCohort,
			want:             Classical,
		},
		{
			name:             "increment counts toward estimate",
			baseSeconds:      180,
			incrementSeconds: 12, // 180 + 40*12 = 660 >= 600 rapid threshold
			cohort:           testCohort,
			want:             Rapid,
		},
		{
			name:             "missing cohort falls back to defaults - blitz",
			baseSeconds:      300,
			incrementSeconds: 0,
			cohort:           otherCohort,
			want:             Blitz,
		},
		{
			name:             "missing cohort falls back to defaults - rapid",
			baseSeconds:      database.DefaultTimeControlThresholds.RapidSeconds,
			incrementSeconds: 0,
			cohort:           otherCohort,
			want:             Rapid,
		},
		{
			name:             "missing cohort falls back to defaults - classical",
			baseSeconds:      database.DefaultTimeControlThresholds.ClassicalSeconds,
			incrementSeconds: 0,
			cohort:           otherCohort,
			want:             Classical,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyGame(tc.baseSeconds, tc.incrementSeconds, tc.cohort, req)
			if got != tc.want {
				t.Errorf("ClassifyGame(%d, %d, %q) = %q, want %q",
					tc.baseSeconds, tc.incrementSeconds, tc.cohort, got, tc.want)
			}
		})
	}
}

func TestEstimateGameSeconds(t *testing.T) {
	if got := EstimateGameSeconds(600, 0); got != 600 {
		t.Errorf("EstimateGameSeconds(600, 0) = %d, want 600", got)
	}
	if got := EstimateGameSeconds(180, 2); got != 260 {
		t.Errorf("EstimateGameSeconds(180, 2) = %d, want 260", got)
	}
}
