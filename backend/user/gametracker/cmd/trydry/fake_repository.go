package main

import "github.com/jackstenglein/chess-dojo-scheduler/backend/database"

// fakeRepository is an in-memory stand-in for database.UserProgressUpdater, used
// so trydry can run the exact same UpdateProgressAndLog logic the real sync job
// uses, without ever touching AWS/DynamoDB. Nothing it does is persisted anywhere.
type fakeRepository struct {
	user            *database.User
	timelineEntries []*database.TimelineEntry
}

func newFakeRepository(user *database.User) *fakeRepository {
	return &fakeRepository{user: user}
}

func (f *fakeRepository) GetUser(username string) (*database.User, error) { return f.user, nil }

func (f *fakeRepository) UpdateUser(username string, update *database.UserUpdate) (*database.User, error) {
	return f.user, nil
}

func (f *fakeRepository) RecordSubscriptionCancelation(cohort database.DojoCohort) error { return nil }
func (f *fakeRepository) RecordFreeTierConversion(cohort database.DojoCohort) error      { return nil }

func (f *fakeRepository) ListTimelineEntries(owner string, startKey string) ([]*database.TimelineEntry, string, error) {
	return f.timelineEntries, "", nil
}

func (f *fakeRepository) GetRequirement(id string) (*database.Requirement, error) { return nil, nil }

func (f *fakeRepository) PutTimelineEntry(entry *database.TimelineEntry) error {
	f.timelineEntries = append(f.timelineEntries, entry)
	return nil
}

func (f *fakeRepository) PutTimelineEntries(entries []*database.TimelineEntry) (int, error) {
	return 0, nil
}

func (f *fakeRepository) DeleteTimelineEntries(entries []*database.TimelineEntry) (int, error) {
	return 0, nil
}

func (f *fakeRepository) UpdateUserProgress(username string, progressEntry *database.RequirementProgress) (*database.User, error) {
	if f.user.Progress == nil {
		f.user.Progress = make(map[string]*database.RequirementProgress)
	}
	f.user.Progress[progressEntry.RequirementId] = progressEntry
	return f.user, nil
}

func (f *fakeRepository) AddSentMilestoneNotification(username string, milestoneKey string) error {
	return nil
}
