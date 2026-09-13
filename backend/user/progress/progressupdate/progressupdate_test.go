package progressupdate

import (
	"testing"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/database"
)

// fakeRepository is a minimal in-memory implementation of database.UserProgressUpdater.
type fakeRepository struct {
	users               map[string]*database.User
	putTimelineEntries  []*database.TimelineEntry
	putTimelineEntryErr error
}

func newFakeRepository(user *database.User) *fakeRepository {
	return &fakeRepository{users: map[string]*database.User{user.Username: user}}
}

func (f *fakeRepository) GetUser(username string) (*database.User, error) {
	return f.users[username], nil
}

func (f *fakeRepository) UpdateUser(username string, update *database.UserUpdate) (*database.User, error) {
	return f.users[username], nil
}

func (f *fakeRepository) RecordSubscriptionCancelation(cohort database.DojoCohort) error { return nil }
func (f *fakeRepository) RecordFreeTierConversion(cohort database.DojoCohort) error      { return nil }

func (f *fakeRepository) ListTimelineEntries(owner string, startKey string) ([]*database.TimelineEntry, string, error) {
	return nil, "", nil
}

func (f *fakeRepository) GetRequirement(id string) (*database.Requirement, error) {
	return nil, nil
}

func (f *fakeRepository) PutTimelineEntry(entry *database.TimelineEntry) error {
	if f.putTimelineEntryErr != nil {
		return f.putTimelineEntryErr
	}
	f.putTimelineEntries = append(f.putTimelineEntries, entry)
	return nil
}

func (f *fakeRepository) PutTimelineEntries(entries []*database.TimelineEntry) (int, error) {
	return 0, nil
}

func (f *fakeRepository) DeleteTimelineEntries(entries []*database.TimelineEntry) (int, error) {
	return 0, nil
}

func (f *fakeRepository) UpdateUserProgress(username string, progressEntry *database.RequirementProgress) (*database.User, error) {
	user := f.users[username]
	if user.Progress == nil {
		user.Progress = make(map[string]*database.RequirementProgress)
	}
	user.Progress[progressEntry.RequirementId] = progressEntry
	return user, nil
}

func (f *fakeRepository) AddSentMilestoneNotification(username string, milestoneKey string) error {
	return nil
}

func testRequirement() *database.Requirement {
	return &database.Requirement{
		Id:              "games-and-analysis",
		Name:            "Games + Analysis",
		Category:        "Games + Analysis",
		Counts:          map[database.DojoCohort]int{"1500-1600": 500},
		NumberOfCohorts: 1,
		UnitScore:       0.1,
	}
}

func TestUpdateProgressAndLog_CreatesTimelineEntryAndUpdatesProgress(t *testing.T) {
	user := &database.User{
		Username:    "testuser",
		DisplayName: "Test User",
		DojoCohort:  "1500-1600",
	}
	repo := newFakeRepository(user)
	requirement := testRequirement()

	updatedUser, entry, err := UpdateProgressAndLog(repo, user, requirement, &Request{
		RequirementId:           requirement.Id,
		Cohort:                  "1500-1600",
		PreviousCount:           0,
		NewCount:                30,
		IncrementalMinutesSpent: 30,
		GameInfo: &database.TimelineGameInfo{
			Id:         "game123",
			AutoLogged: true,
			Source:     "lichess",
		},
	})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}

	if entry.RequirementCategory != "Games + Analysis" {
		t.Errorf("expected category 'Games + Analysis', got %q", entry.RequirementCategory)
	}
	if entry.TotalMinutesSpent != 30 || entry.MinutesSpent != 30 {
		t.Errorf("expected 30 minutes spent, got total=%d incremental=%d", entry.TotalMinutesSpent, entry.MinutesSpent)
	}
	if entry.GameInfo == nil || !entry.GameInfo.AutoLogged || entry.GameInfo.Source != "lichess" {
		t.Errorf("expected auto-logged lichess game info, got %+v", entry.GameInfo)
	}

	wantPoints := requirement.CalculateScoreCount("1500-1600", 30) - requirement.CalculateScoreCount("1500-1600", 0)
	if entry.DojoPoints != wantPoints {
		t.Errorf("expected DojoPoints %v, got %v", wantPoints, entry.DojoPoints)
	}

	progress := updatedUser.Progress[requirement.Id]
	if progress == nil || progress.Counts[database.AllCohorts] != 30 {
		t.Fatalf("expected progress count 30 for AllCohorts, got %+v", progress)
	}
	if progress.MinutesSpent["1500-1600"] != 30 {
		t.Errorf("expected 30 minutes spent in progress, got %d", progress.MinutesSpent["1500-1600"])
	}

	if len(repo.putTimelineEntries) != 1 {
		t.Fatalf("expected exactly 1 timeline entry written, got %d", len(repo.putTimelineEntries))
	}
}

func TestUpdateProgressAndLog_AccumulatesMinutesAcrossCalls(t *testing.T) {
	user := &database.User{Username: "testuser", DojoCohort: "1500-1600"}
	repo := newFakeRepository(user)
	requirement := testRequirement()

	req := &Request{
		RequirementId:           requirement.Id,
		Cohort:                  "1500-1600",
		IncrementalMinutesSpent: 20,
		NewCount:                20,
	}
	_, _, err := UpdateProgressAndLog(repo, user, requirement, req)
	if err != nil {
		t.Fatalf("first call failed: %v", err)
	}

	req2 := &Request{
		RequirementId:           requirement.Id,
		Cohort:                  "1500-1600",
		PreviousCount:           20,
		NewCount:                50,
		IncrementalMinutesSpent: 30,
	}
	_, entry2, err := UpdateProgressAndLog(repo, user, requirement, req2)
	if err != nil {
		t.Fatalf("second call failed: %v", err)
	}

	if entry2.TotalMinutesSpent != 50 {
		t.Errorf("expected accumulated total of 50 minutes, got %d", entry2.TotalMinutesSpent)
	}
}

func TestUpdateProgressAndLog_InvalidCohortReturnsError(t *testing.T) {
	user := &database.User{Username: "testuser", DojoCohort: "1500-1600"}
	repo := newFakeRepository(user)
	requirement := testRequirement()

	_, _, err := UpdateProgressAndLog(repo, user, requirement, &Request{
		RequirementId: requirement.Id,
		Cohort:        "9999-9999",
		NewCount:      10,
	})
	if err == nil {
		t.Fatal("expected error for cohort not present on requirement, got nil")
	}
}

func TestUpdateProgressAndLog_PropagatesTimelineWriteError(t *testing.T) {
	user := &database.User{Username: "testuser", DojoCohort: "1500-1600"}
	repo := newFakeRepository(user)
	repo.putTimelineEntryErr = errTest
	requirement := testRequirement()

	_, _, err := UpdateProgressAndLog(repo, user, requirement, &Request{
		RequirementId: requirement.Id,
		Cohort:        "1500-1600",
		NewCount:      10,
	})
	if err != errTest {
		t.Fatalf("expected timeline write error to propagate, got %v", err)
	}
}

var errTest = &testError{}

type testError struct{}

func (e *testError) Error() string { return "test error" }
