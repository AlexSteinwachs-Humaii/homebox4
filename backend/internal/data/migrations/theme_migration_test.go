package migrations

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	_ "github.com/sysadminsmedia/homebox/backend/pkgs/cgofreesqlite"
)

// PostgreSQL upgrade coverage is opt-in against an isolated test database.
// The temporary users table shadows any real users table on this connection.
func TestClaudeThemeMigration(t *testing.T) {
	for _, dialect := range []string{"sqlite3", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			driver, dsn, column := "sqlite3", ":memory:", "JSON"
			if dialect == "postgres" {
				driver, dsn, column = "pgx", os.Getenv("TEST_POSTGRES_DSN"), "JSONB"
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
			}
			db, err := sql.Open(driver, dsn)
			require.NoError(t, err)
			defer db.Close()
			conn, err := db.Conn(context.Background())
			require.NoError(t, err)
			defer conn.Close()
			_, err = conn.ExecContext(context.Background(), "CREATE TEMP TABLE users (id INTEGER PRIMARY KEY, settings "+column+")")
			require.NoError(t, err)
			rows := []string{`{"theme":"dark","language":"de","unknown":{"keep":true}}`, `{}`, `null`, `[]`, `{"theme":"light","themeMigrationVersion":1,"language":"fr"}`}
			if dialect == "sqlite3" {
				rows = append(rows, `not json`)
			}
			for i, value := range rows {
				_, err = conn.ExecContext(context.Background(), "INSERT INTO users (id,settings) VALUES ($1,$2)", i, value)
				require.NoError(t, err)
			}
			files, err := Migrations(dialect)
			require.NoError(t, err)
			contents, err := files.ReadFile(dialect + "/20261009120000_claude_theme.sql")
			require.NoError(t, err)
			up := strings.Split(string(contents), "-- +goose Down")[0]
			for pass := 0; pass < 2; pass++ {
				_, err = conn.ExecContext(context.Background(), up)
				require.NoError(t, err)
				for i := range rows {
					var raw string
					require.NoError(t, conn.QueryRowContext(context.Background(), "SELECT settings FROM users WHERE id=$1", i).Scan(&raw))
					var settings map[string]interface{}
					require.NoError(t, json.Unmarshal([]byte(raw), &settings))
					expected := "claude"
					if i == 4 {
						expected = "light"
					}
					if pass == 1 && i == 0 {
						expected = "dark"
					}
					require.Equal(t, expected, settings["theme"])
					require.Equal(t, float64(1), settings["themeMigrationVersion"])
					if i == 0 {
						require.Equal(t, "de", settings["language"])
						require.Equal(t, map[string]interface{}{"keep": true}, settings["unknown"])
					}
				}
				if pass == 0 {
					_, err = conn.ExecContext(context.Background(), `UPDATE users SET settings=$1 WHERE id=0`, `{"theme":"dark","themeMigrationVersion":1,"language":"de","unknown":{"keep":true}}`)
					require.NoError(t, err)
				}
			}
		})
	}
}
