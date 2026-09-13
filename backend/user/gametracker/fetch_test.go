package gametracker

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackstenglein/chess-dojo-scheduler/backend/api/errors"
)

func setupLichess(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	original := lichessHost
	lichessHost = server.URL
	t.Cleanup(func() { lichessHost = original })
}

func setupChesscom(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	original := chesscomHost
	chesscomHost = server.URL
	t.Cleanup(func() { chesscomHost = original })
}

func TestFetchLichessGames_Success(t *testing.T) {
	const ndjson = `{"id":"abc123","rated":true,"lastMoveAt":1700000000000,"clock":{"initial":600,"increment":0}}
{"id":"def456","rated":false,"lastMoveAt":1700000100000,"clock":{"initial":180,"increment":2}}
`
	var gotAccept string
	setupLichess(t, func(w http.ResponseWriter, r *http.Request) {
		gotAccept = r.Header.Get("Accept")
		_, _ = w.Write([]byte(ndjson))
	})

	games, err := FetchLichessGames("testuser", time.Unix(0, 0), 100)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("expected 2 games, got %d", len(games))
	}
	if games[0].Id != "abc123" || games[0].BaseSeconds != 600 || !games[0].Rated {
		t.Errorf("unexpected first game: %+v", games[0])
	}
	if games[1].Id != "def456" || games[1].IncrementSeconds != 2 || games[1].Rated {
		t.Errorf("unexpected second game: %+v", games[1])
	}
	if gotAccept != "application/x-ndjson" {
		t.Errorf("expected ndjson Accept header, got %q", gotAccept)
	}
}

func TestFetchLichessGames_EmptyResponse(t *testing.T) {
	setupLichess(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(""))
	})

	games, err := FetchLichessGames("testuser", time.Unix(0, 0), 100)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(games) != 0 {
		t.Errorf("expected 0 games, got %d", len(games))
	}
}

func TestFetchLichessGames_404IsErrNotFound(t *testing.T) {
	setupLichess(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	_, err := FetchLichessGames("testuser", time.Unix(0, 0), 100)
	if !errors.Is(err, ErrGameFetchNotFound) {
		t.Fatalf("expected ErrGameFetchNotFound, got %v", err)
	}
}

func TestFetchChesscomGames_FiltersByArchiveAndSince(t *testing.T) {
	since := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

	setupChesscom(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/pub/player/testuser/games/archives":
			_, _ = w.Write([]byte(`{"archives":[
				"` + chesscomHost + `/pub/player/testuser/games/2023/12",
				"` + chesscomHost + `/pub/player/testuser/games/2024/01",
				"` + chesscomHost + `/pub/player/testuser/games/2024/02"
			]}`))
		case r.URL.Path == "/pub/player/testuser/games/2024/01":
			// One game before since (filtered out), one after (kept).
			beforeSince := since.Add(-time.Hour).Unix()
			afterSince := since.Add(time.Hour).Unix()
			_, _ = fmt.Fprintf(w, `{"games":[
				{"url":"g1","end_time":%d,"rated":true,"time_control":"600"},
				{"url":"g2","end_time":%d,"rated":true,"time_control":"1800+2"}
			]}`, beforeSince, afterSince)
		case r.URL.Path == "/pub/player/testuser/games/2024/02":
			afterSince := since.Add(48 * time.Hour).Unix()
			_, _ = fmt.Fprintf(w, `{"games":[{"url":"g3","end_time":%d,"rated":false,"time_control":"300+5"}]}`, afterSince)
		default:
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
	})

	games, err := FetchChesscomGames("testuser", since)
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if len(games) != 2 {
		t.Fatalf("expected 2 games (2023/12 archive skipped, g1 filtered by since), got %d: %+v", len(games), games)
	}
	if games[0].Id != "g2" || games[0].BaseSeconds != 1800 || games[0].IncrementSeconds != 2 {
		t.Errorf("unexpected first game: %+v", games[0])
	}
	if games[1].Id != "g3" || games[1].BaseSeconds != 300 || games[1].IncrementSeconds != 5 {
		t.Errorf("unexpected second game: %+v", games[1])
	}
}

func TestFetchChesscomGames_PrivateProfileIsNotFound(t *testing.T) {
	setupChesscom(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	})

	_, err := FetchChesscomGames("privateuser", time.Now())
	if !errors.Is(err, ErrGameFetchNotFound) {
		t.Fatalf("expected ErrGameFetchNotFound for 403, got %v", err)
	}
}

func TestParseChesscomTimeControl(t *testing.T) {
	tests := []struct {
		input       string
		wantBase    int
		wantIncr    int
		wantAtLeast bool // for daily/correspondence: just assert a large base
	}{
		{"600+5", 600, 5, false},
		{"600", 600, 0, false},
		{"180", 180, 0, false},
		{"1/86400", 0, 0, true},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			base, incr := parseChesscomTimeControl(tc.input)
			if tc.wantAtLeast {
				if base < 1800 {
					t.Errorf("parseChesscomTimeControl(%q) base = %d, want a large classical-length value", tc.input, base)
				}
				return
			}
			if base != tc.wantBase || incr != tc.wantIncr {
				t.Errorf("parseChesscomTimeControl(%q) = (%d, %d), want (%d, %d)", tc.input, base, incr, tc.wantBase, tc.wantIncr)
			}
		})
	}
}

func TestRelevantChesscomArchives(t *testing.T) {
	archives := []string{
		"https://api.chess.com/pub/player/x/games/2023/11",
		"https://api.chess.com/pub/player/x/games/2023/12",
		"https://api.chess.com/pub/player/x/games/2024/01",
		"https://api.chess.com/pub/player/x/games/2024/02",
	}
	since := time.Date(2023, 12, 20, 0, 0, 0, 0, time.UTC)

	got := relevantChesscomArchives(archives, since)
	if len(got) != 3 {
		t.Fatalf("expected 3 relevant archives (Dec 2023 onward), got %d: %v", len(got), got)
	}
	if got[0] != archives[1] {
		t.Errorf("expected first relevant archive to be Dec 2023, got %q", got[0])
	}
}
