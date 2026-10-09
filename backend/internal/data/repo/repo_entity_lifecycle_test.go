package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	entsql "entgo.io/ent/dialect/sql"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entityoffboarding"
	"github.com/sysadminsmedia/homebox/backend/internal/data/migrations"
)

// Each walk owns its database, rather than sharing the repository suite's state.
// Set OFFBOARDING_POSTGRES_DSN to a disposable PostgreSQL database to also run
// the same upgrade, rollback and concurrency assertions on that dialect.
func lifecycleDatabase(t *testing.T, dialect string) (*EntityRepository, *ent.Client, uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	driver, dsn := "sqlite3", "file:"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite&_pragma=busy_timeout=5000"
	if dialect == "postgres" {
		driver, dsn = "pgx", os.Getenv("OFFBOARDING_POSTGRES_DSN")
	}
	db, err := sql.Open(driver, dsn)
	require.NoError(t, err)
	schema := ""
	if dialect == "postgres" {
		schema = "lifecycle_" + strings.ReplaceAll(uuid.NewString(), "-", "")
		_, err = db.Exec("CREATE SCHEMA " + schema)
		require.NoError(t, err)
		require.NoError(t, db.Close())
		cfg, err := pgx.ParseConfig(dsn)
		require.NoError(t, err)
		cfg.RuntimeParams["search_path"] = schema
		db = stdlib.OpenDB(*cfg)
	}
	client := ent.NewClient(ent.Driver(entsql.OpenDB(dialect, db)))
	t.Cleanup(func() {
		if schema != "" {
			_, _ = db.Exec("DROP SCHEMA " + schema + " CASCADE")
		}
		_ = client.Close()
	})
	require.NoError(t, client.Schema.Create(ctx))
	g, err := client.Group.Create().SetName("lifecycle").Save(ctx)
	require.NoError(t, err)
	et, err := client.EntityType.Create().SetName("item").SetGroupID(g.ID).Save(ctx)
	require.NoError(t, err)
	e, err := client.Entity.Create().SetName("legacy").SetGroupID(g.ID).SetEntityTypeID(et.ID).SetArchived(true).SetSoldTo("legacy buyer").SetSoldPrice(42).Save(ctx)
	require.NoError(t, err)

	// Turn the freshly generated schema into the previous entity schema, then
	// execute the embedded upgrade over real populated legacy data.
	_, err = db.Exec("DROP TABLE entity_offboardings")
	require.NoError(t, err)
	_, err = db.Exec("DROP INDEX entity_offboarded")
	require.NoError(t, err)
	_, err = db.Exec("ALTER TABLE entities DROP COLUMN offboarded")
	require.NoError(t, err)
	fs, err := migrations.Migrations(dialect)
	require.NoError(t, err)
	migration, err := fs.ReadFile(dialect + "/20261009000000_add_entity_offboarding.sql")
	require.NoError(t, err)
	up := strings.Split(string(migration), "-- +goose Down")[0]
	var lines []string
	for _, line := range strings.Split(up, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			lines = append(lines, line)
		}
	}
	for _, stmt := range strings.Split(strings.Join(lines, "\n"), ";") {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		_, err = db.Exec(stmt)
		require.NoError(t, err, "migration statement: %s", stmt)
	}
	r := &EntityRepository{db: client, bus: tbus}
	legacy, err := client.Entity.Get(ctx, e.ID)
	require.NoError(t, err)
	require.False(t, legacy.Offboarded)
	require.True(t, legacy.Archived)
	require.Equal(t, "legacy buyer", legacy.SoldTo)
	require.Equal(t, float64(42), legacy.SoldPrice)
	count, err := client.EntityOffboarding.Query().Count(ctx)
	require.NoError(t, err)
	require.Zero(t, count)
	return r, client, g.ID, e.ID
}

func TestEntityLifecycle(t *testing.T) {
	dialects := []string{"sqlite3"}
	if os.Getenv("OFFBOARDING_POSTGRES_DSN") != "" {
		dialects = append(dialects, "postgres")
	}
	for _, dialect := range dialects {
		t.Run(dialect, func(t *testing.T) {
			r, client, gid, id := lifecycleDatabase(t, dialect)
			ctx := context.Background()
			date := time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)
			for _, invalid := range []EntityOffboard{
				{Outcome: "unknown", EffectiveDate: date},
				{Outcome: "sold"},
				{Outcome: "custom", EffectiveDate: date, CustomReason: " \t\n "},
				{Outcome: "sold", EffectiveDate: date.Add(time.Second)},
				{Outcome: "sold", EffectiveDate: date, Notes: strings.Repeat("x", 1001)},
				{Outcome: "custom", EffectiveDate: date, CustomReason: strings.Repeat("x", 256)},
			} {
				_, err := r.OffboardByGroup(ctx, gid, id, invalid)
				require.ErrorIs(t, err, ErrInvalidOffboarding)
			}
			_, err := r.OffboardByGroup(ctx, uuid.New(), id, EntityOffboard{Outcome: "sold", EffectiveDate: date})
			require.ErrorIs(t, err, ErrInvalidLifecycleTransition)
			_, err = r.OffboardingHistoryByGroup(ctx, uuid.New(), id)
			require.Error(t, err)
			require.ErrorIs(t, r.ReactivateByGroup(ctx, gid, id), ErrInvalidLifecycleTransition)

			locationType, err := client.EntityType.Create().SetGroupID(gid).SetName("location").SetIsLocation(true).Save(ctx)
			require.NoError(t, err)
			location, err := client.Entity.Create().SetGroupID(gid).SetEntityTypeID(locationType.ID).SetName("room").Save(ctx)
			require.NoError(t, err)
			_, err = r.OffboardByGroup(ctx, gid, location.ID, EntityOffboard{Outcome: "sold", EffectiveDate: date})
			require.ErrorIs(t, err, ErrInvalidLifecycleTransition)

			var previous []*ent.EntityOffboarding
			for i, outcome := range []string{"sold", "donated", "disposed", "recycled", "lost", "custom"} {
				data := EntityOffboard{Outcome: outcome, EffectiveDate: date, Notes: "retained notes"}
				if outcome == "custom" {
					data.CustomReason = "  returned to supplier  "
				}
				record, err := r.OffboardByGroup(ctx, gid, id, data)
				require.NoError(t, err)
				require.Equal(t, date, record.EffectiveDate)
				require.Equal(t, data.Notes, record.Notes)
				require.Nil(t, record.ReactivatedAt)
				if outcome == "custom" {
					require.Equal(t, "returned to supplier", record.CustomReason)
				}
				state, err := client.Entity.Get(ctx, id)
				require.NoError(t, err)
				require.True(t, state.Offboarded)
				require.True(t, state.Archived)
				require.Equal(t, "legacy buyer", state.SoldTo)
				require.Equal(t, float64(42), state.SoldPrice)
				if i == 0 {
					// Simulate stale generic edit and patch payloads containing lifecycle keys.
					// Their write DTOs intentionally do not expose those keys.
					var stale EntityUpdate
					require.NoError(t, json.Unmarshal([]byte(`{"offboarded":false,"offboardingRecords":[]}`), &stale))
					typeID, err := state.QueryEntityType().OnlyID(ctx)
					require.NoError(t, err)
					stale.ID, stale.EntityTypeID, stale.Name, stale.Quantity = id, typeID, "edited", 1
					_, err = r.UpdateByGroup(ctx, gid, stale)
					require.NoError(t, err)
					var patch EntityPatch
					require.NoError(t, json.Unmarshal([]byte(`{"offboarded":false}`), &patch))
					require.NoError(t, r.Patch(ctx, gid, id, patch))
					edited, err := client.Entity.Get(ctx, id)
					require.NoError(t, err)
					require.True(t, edited.Offboarded)
					// Restore the independent sale/archive fields for the rest of this walk.
					_, err = client.Entity.UpdateOneID(id).SetArchived(true).SetSoldTo("legacy buyer").SetSoldPrice(42).Save(ctx)
					require.NoError(t, err)
					duplicate, err := r.Duplicate(ctx, gid, id, DuplicateOptions{})
					require.NoError(t, err)
					copied, err := client.Entity.Get(ctx, duplicate.ID)
					require.NoError(t, err)
					require.False(t, copied.Offboarded)
					copiedHistory, err := r.OffboardingHistoryByGroup(ctx, gid, copied.ID)
					require.NoError(t, err)
					require.Empty(t, copiedHistory)
				}
				_, err = r.OffboardByGroup(ctx, gid, id, data)
				require.ErrorIs(t, err, ErrInvalidLifecycleTransition)
				require.ErrorIs(t, r.ReactivateByGroup(ctx, uuid.New(), id), ErrInvalidLifecycleTransition)
				require.NoError(t, r.ReactivateByGroup(ctx, gid, id))
				require.ErrorIs(t, r.ReactivateByGroup(ctx, gid, id), ErrInvalidLifecycleTransition)
				history, err := r.OffboardingHistoryByGroup(ctx, gid, id)
				require.NoError(t, err)
				require.Len(t, history, i+1)
				for j, old := range previous {
					oldJSON, err := json.Marshal(old)
					require.NoError(t, err)
					actualJSON, err := json.Marshal(history[j])
					require.NoError(t, err)
					require.JSONEq(t, string(oldJSON), string(actualJSON))
				}
				require.Equal(t, record.ID, history[i].ID)
				require.NotNil(t, history[i].ReactivatedAt)
				previous = history
			}

			// Competing submissions: exactly one commit per valid state transition.
			for _, offboard := range []bool{true, false} {
				var wg sync.WaitGroup
				successes := make(chan bool, 8)
				for range 8 {
					wg.Go(func() {
						var err error
						if offboard {
							_, err = r.OffboardByGroup(ctx, gid, id, EntityOffboard{Outcome: "lost", EffectiveDate: date})
						} else {
							err = r.ReactivateByGroup(ctx, gid, id)
						}
						successes <- err == nil
					})
				}
				wg.Wait()
				close(successes)
				n := 0
				for success := range successes {
					if success {
						n++
					}
				}
				require.Equal(t, 1, n)
			}
			history, err := r.OffboardingHistoryByGroup(ctx, gid, id)
			require.NoError(t, err)
			require.Len(t, history, 7)

			// Force insertion failure after the state UPDATE using an inconsistent open
			// cycle. The unique DB constraint must roll the claimed state back.
			_, err = client.EntityOffboarding.Create().SetEntityID(id).SetOutcome(entityoffboarding.OutcomeLost).SetEffectiveDate(date).Save(ctx)
			require.NoError(t, err)
			_, err = r.OffboardByGroup(ctx, gid, id, EntityOffboard{Outcome: "sold", EffectiveDate: date})
			require.Error(t, err)
			state, err := client.Entity.Get(ctx, id)
			require.NoError(t, err)
			require.False(t, state.Offboarded)
			// Conversely, missing open history must roll a reactivation back.
			_, err = client.EntityOffboarding.Delete().Where(entityoffboarding.EntityID(id), entityoffboarding.ReactivatedAtIsNil()).Exec(ctx)
			require.NoError(t, err)
			_, err = client.Entity.UpdateOneID(id).SetOffboarded(true).Save(ctx)
			require.NoError(t, err)
			require.ErrorIs(t, r.ReactivateByGroup(ctx, gid, id), ErrInvalidLifecycleTransition)
			state, err = client.Entity.Get(ctx, id)
			require.NoError(t, err)
			require.True(t, state.Offboarded)
			require.NoError(t, client.Entity.DeleteOneID(id).Exec(ctx))
			n, err := client.EntityOffboarding.Query().Count(ctx)
			require.NoError(t, err)
			require.Zero(t, n, fmt.Sprintf("cascade on %s", dialect))
		})
	}
}
