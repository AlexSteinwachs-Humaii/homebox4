package services

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gocloud.dev/blob"

	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entityoffboarding"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/group"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// Exercise the real full artifact/transactional restore path, rather than
// only checking that the new table appears in the dependency list.
func TestExportLifecycleRoundTrip(t *testing.T) {
	ctx := context.Background()
	src, err := tRepos.Groups.GroupCreate(ctx, "lifecycle-src-"+fk.Str(6), uuid.Nil)
	require.NoError(t, err)
	et, err := tRepos.EntityTypes.GetDefault(ctx, src.ID, false)
	require.NoError(t, err)
	ids := make(map[string]uuid.UUID)
	for _, name := range []string{"active", "returned", "offboarded"} {
		item, err := tRepos.Entities.Create(ctx, src.ID, repo.EntityCreate{Name: name, EntityTypeID: et.ID})
		require.NoError(t, err)
		ids[name] = item.ID
	}
	date := time.Date(2025, 3, 4, 0, 0, 0, 0, time.UTC)
	for _, outcome := range []string{"sold", "donated", "disposed", "recycled", "lost", "custom"} {
		_, err := tRepos.Entities.OffboardByGroup(ctx, src.ID, ids["returned"], repo.EntityOffboard{
			Outcome: outcome, EffectiveDate: date, CustomReason: "retired for storage", Notes: "retained notes ✓\nsecond line",
		})
		require.NoError(t, err)
		require.NoError(t, tRepos.Entities.ReactivateByGroup(ctx, src.ID, ids["returned"]))
	}
	_, err = tRepos.Entities.OffboardByGroup(ctx, src.ID, ids["offboarded"], repo.EntityOffboard{
		Outcome: "custom", EffectiveDate: date, CustomReason: "no longer needed", Notes: "keep this open cycle",
	})
	require.NoError(t, err)
	// Ordinary active inventory is intentionally not what full backup exports.
	active, err := tRepos.Entities.QueryByGroup(ctx, src.ID, repo.EntityQuery{})
	require.NoError(t, err)
	assert.EqualValues(t, 2, active.Total)
	exp, err := tRepos.Exports.Create(ctx, src.ID)
	require.NoError(t, err)
	key, _, err := tSvc.Exports.buildArtifact(ctx, exp.ID, src.ID)
	require.NoError(t, err)
	bk, err := blob.OpenBucket(ctx, tRepos.Attachments.GetConnString())
	require.NoError(t, err)
	defer func() { _ = bk.Close() }()
	original, err := bk.ReadAll(ctx, tRepos.Attachments.GetFullPath(key))
	require.NoError(t, err)
	zr, err := zip.NewReader(bytes.NewReader(original), int64(len(original)))
	require.NoError(t, err)
	rows, err := readTableJSON(zr, "entity_offboardings.json")
	require.NoError(t, err)
	require.Len(t, rows, 7, "full export includes completed and open cycles")
	entities, err := readTableJSON(zr, "entities.json")
	require.NoError(t, err)
	require.Len(t, entities, 3, "full export includes the offboarded item")

	for _, mode := range []string{"roundtrip", "legacy", "foreign", "missing", "null"} {
		t.Run(mode, func(t *testing.T) {
			dst, err := tRepos.Groups.GroupCreate(ctx, "lifecycle-dst-"+fk.Str(6), uuid.Nil)
			require.NoError(t, err)
			archive := original
			if mode != "roundtrip" {
				archive = rewriteLifecycleArchive(t, original, mode, ids["active"])
			}
			uploadKey := dst.ID.String() + "/imports/" + uuid.NewString() + ".zip"
			require.NoError(t, bk.WriteAll(ctx, tRepos.Attachments.GetFullPath(uploadKey), archive, nil))
			imp, err := tRepos.Exports.CreateImport(ctx, dst.ID, uploadKey, int64(len(archive)))
			require.NoError(t, err)
			err = tSvc.Exports.runImport(ctx, dst.ID, tUser.ID, imp.ID, uploadKey)
			if mode == "foreign" || mode == "missing" || mode == "null" {
				require.ErrorContains(t, err, "offboarding history references an entity absent from the backup")
				n, err := tClient.Entity.Query().Where(entity.HasGroupWith(group.ID(dst.ID))).Count(ctx)
				require.NoError(t, err)
				assert.Zero(t, n, "failed restore rolls back entity inserts")
				n, err = tClient.EntityOffboarding.Query().Where(entityoffboarding.EntityID(ids["active"])).Count(ctx)
				require.NoError(t, err)
				assert.Zero(t, n, "must not attach history to an existing source-collection asset")
				return
			}
			require.NoError(t, err)
			for name, oldID := range ids {
				got, err := tClient.Entity.Query().Where(entity.Name(name), entity.HasGroupWith(group.ID(dst.ID))).Only(ctx)
				require.NoError(t, err)
				assert.NotEqual(t, oldID, got.ID)
				assert.Equal(t, mode != "legacy" && name == "offboarded", got.Offboarded)
				history, err := tRepos.Entities.OffboardingHistoryByGroup(ctx, dst.ID, got.ID)
				require.NoError(t, err)
				if mode == "legacy" {
					assert.Empty(t, history)
					continue
				}
				sourceHistory, err := tRepos.Entities.OffboardingHistoryByGroup(ctx, src.ID, oldID)
				require.NoError(t, err)
				require.Len(t, history, len(sourceHistory))
				for i, record := range history {
					source := sourceHistory[i]
					assert.NotEqual(t, source.ID, record.ID)
					assert.Equal(t, got.ID, record.EntityID)
					assert.Equal(t, source.Outcome, record.Outcome)
					assert.Equal(t, source.CustomReason, record.CustomReason)
					assert.Equal(t, source.Notes, record.Notes)
					assert.True(t, source.EffectiveDate.Equal(record.EffectiveDate))
					assert.True(t, source.CreatedAt.Equal(record.CreatedAt))
					assert.True(t, source.UpdatedAt.Equal(record.UpdatedAt))
					if source.ReactivatedAt == nil {
						assert.Nil(t, record.ReactivatedAt)
					} else {
						require.NotNil(t, record.ReactivatedAt)
						assert.True(t, source.ReactivatedAt.Equal(*record.ReactivatedAt))
					}
				}
				if name == "offboarded" {
					require.NoError(t, tClient.Entity.DeleteOneID(got.ID).Exec(ctx))
					n, err := tClient.EntityOffboarding.Query().Where(entityoffboarding.EntityID(got.ID)).Count(ctx)
					require.NoError(t, err)
					assert.Zero(t, n, "entity deletion cascades history")
				}
			}
			// The shared dependency list must also wipe history before entities.
			tx, err := tSvc.Exports.db.Sql().BeginTx(ctx, nil)
			require.NoError(t, err)
			require.NoError(t, wipeGroup(ctx, tx, tSvc.Exports.dialect, dst.ID))
			var remaining int
			require.NoError(t, tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM entity_offboardings WHERE entity_id NOT IN (SELECT id FROM entities)`).Scan(&remaining))
			assert.Zero(t, remaining, "wipe must not leave orphan history")
			require.NoError(t, tx.Rollback())
			require.NoError(t, tRepos.Groups.GroupDelete(ctx, dst.ID))
			n, err := tClient.EntityOffboarding.Query().Where(entityoffboarding.HasEntityWith(entity.HasGroupWith(group.ID(dst.ID)))).Count(ctx)
			require.NoError(t, err)
			assert.Zero(t, n)
			// A global dangling-FK check catches orphans even after the parent is gone.
			var orphans int
			require.NoError(t, tSvc.Exports.db.Sql().QueryRowContext(ctx, `SELECT COUNT(*) FROM entity_offboardings WHERE entity_id NOT IN (SELECT id FROM entities)`).Scan(&orphans))
			assert.Zero(t, orphans)
			n, err = tClient.EntityOffboarding.Query().Where(entityoffboarding.HasEntityWith(entity.HasGroupWith(group.ID(src.ID)))).Count(ctx)
			require.NoError(t, err)
			assert.Equal(t, 7, n, "destination cleanup must leave source history untouched")
		})
	}
}

// Legacy archives have neither offboarded nor the history table. In the
// adversarial cases the referenced UUID really exists outside the destination
// archive, so a permissive FK fallback would succeed instead of failing.
func rewriteLifecycleArchive(t *testing.T, data []byte, mode string, foreignID uuid.UUID) []byte {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	require.NoError(t, err)
	var out bytes.Buffer
	zw := zip.NewWriter(&out)
	for _, f := range zr.File {
		if mode == "legacy" && f.Name == "entity_offboardings.json" {
			continue
		}
		r, err := f.Open()
		require.NoError(t, err)
		content, err := io.ReadAll(r)
		require.NoError(t, err)
		require.NoError(t, r.Close())
		if f.Name == "entities.json" && (mode == "legacy" || mode == "foreign") {
			var rows []map[string]any
			require.NoError(t, json.Unmarshal(content, &rows))
			if mode == "legacy" {
				for _, row := range rows {
					delete(row, "offboarded")
				}
			} else {
				rows = nil
			}
			content, err = json.Marshal(rows)
			require.NoError(t, err)
		}
		if mode != "legacy" && f.Name == "entity_offboardings.json" {
			var rows []map[string]any
			require.NoError(t, json.Unmarshal(content, &rows))
			rows = rows[:1]
			switch mode {
			case "foreign":
				rows[0]["entity_id"] = foreignID.String()
			case "missing":
				delete(rows[0], "entity_id")
			case "null":
				rows[0]["entity_id"] = nil
			}
			content, err = json.Marshal(rows)
			require.NoError(t, err)
		}
		w, err := zw.Create(f.Name)
		require.NoError(t, err)
		_, err = w.Write(content)
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
	return out.Bytes()
}
