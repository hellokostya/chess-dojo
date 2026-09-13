// Package progressupdate holds the shared logic for turning a progress update
// (count/minutes change on a task) into a correctly-shaped TimelineEntry, DojoPoints
// update, and RequirementProgress update. It is used by both the manual HTTP
// progress-update handler (backend/user/progress/update) and the automatic game
// tracker sync job (backend/user/gametracker/sync), so that both paths feed the
// heatmap, scoreboard, and Activity pie charts identically.
package progressupdate

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/errors"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/log"
	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
)

// Request is a single progress update to apply to a user's task.
type Request struct {
	RequirementId           string              `json:"requirementId"`
	Cohort                  database.DojoCohort `json:"cohort"`
	PreviousCount           int                 `json:"previousCount"`
	NewCount                int                 `json:"newCount"`
	IncrementalMinutesSpent int                 `json:"incrementalMinutesSpent"`
	Date                    string              `json:"date"`
	Notes                   string              `json:"notes"`

	// GameInfo, if set, is attached to the resulting TimelineEntry. Used by the
	// game tracker to mark an entry as auto-logged from a specific platform.
	GameInfo *database.TimelineGameInfo
}

// UpdateProgressAndLog applies a progress update for the given user/task/request,
// writes the resulting TimelineEntry, and persists the updated progress. It is the
// single source of truth for turning a count/minutes update into a correctly-shaped
// TimelineEntry (feeding the heatmap), DojoPoints (feeding the scoreboard), and
// RequirementProgress update (feeding the Activity pie charts).
func UpdateProgressAndLog(
	repository database.UserProgressUpdater,
	user *database.User,
	task database.Task,
	request *Request,
) (*database.User, *database.TimelineEntry, error) {
	totalCount, ok := task.GetCounts()[request.Cohort]
	if !ok {
		return nil, nil, errors.New(400, fmt.Sprintf("Invalid request: cohort `%s` does not apply to this requirement", request.Cohort), "")
	}

	progress, ok := user.Progress[request.RequirementId]
	if !ok {
		progress = &database.RequirementProgress{
			RequirementId: request.RequirementId,
			Counts:        make(map[database.DojoCohort]int),
			MinutesSpent:  make(map[database.DojoCohort]int),
		}
	}
	if progress.Counts == nil {
		progress.Counts = make(map[database.DojoCohort]int)
	}

	if task.GetNumberOfCohorts() == 1 || task.GetNumberOfCohorts() == 0 {
		progress.Counts[database.AllCohorts] = request.NewCount
	} else {
		progress.Counts[request.Cohort] = request.NewCount
	}
	progress.MinutesSpent[request.Cohort] += request.IncrementalMinutesSpent

	now := time.Now()
	updatedAt := now.Format(time.RFC3339)
	progress.UpdatedAt = updatedAt

	date := now
	if request.Date != "" {
		d, err := time.Parse(time.RFC3339, request.Date)
		if err != nil {
			log.Errorf("Failed to parse request.Date: %v", err)
		} else {
			date = d
		}
	}

	originalScore := task.CalculateScoreCount(request.Cohort, request.PreviousCount)
	newScore := task.CalculateScoreCount(request.Cohort, request.NewCount)

	timelineEntry := &database.TimelineEntry{
		TimelineEntryKey: database.TimelineEntryKey{
			Owner: user.Username,
			Id:    fmt.Sprintf("%s_%s", date.Format(time.DateOnly), uuid.NewString()),
		},
		OwnerDisplayName:    user.DisplayName,
		RequirementId:       request.RequirementId,
		RequirementName:     task.GetName(),
		RequirementCategory: task.GetCategory(),
		IsCustomRequirement: task.IsCustom(),
		ScoreboardDisplay:   task.GetScoreboardDisplay(),
		ProgressBarSuffix:   task.GetProgressBarSuffix(),
		Cohort:              request.Cohort,
		TotalCount:          totalCount,
		PreviousCount:       request.PreviousCount,
		NewCount:            request.NewCount,
		DojoPoints:          newScore - originalScore,
		TotalDojoPoints:     newScore,
		MinutesSpent:        request.IncrementalMinutesSpent,
		TotalMinutesSpent:   progress.MinutesSpent[request.Cohort],
		Date:                date.Format(time.RFC3339),
		CreatedAt:           updatedAt,
		Notes:               request.Notes,
		GameInfo:            request.GameInfo,
	}

	if err := repository.PutTimelineEntry(timelineEntry); err != nil {
		return nil, nil, err
	}

	updatedUser, err := repository.UpdateUserProgress(user.Username, progress)
	if err != nil {
		return nil, nil, err
	}

	return updatedUser, timelineEntry, nil
}
