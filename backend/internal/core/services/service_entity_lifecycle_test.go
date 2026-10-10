package services

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
)

func TestEntityServiceLifecycleCSV(t *testing.T) {
	client, err := ent.Open("sqlite3", "file:"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Close() })
	require.NoError(t, client.Schema.Create(context.Background()))
	repos := repo.New(client, tbus, config.Storage{PrefixPath: "/", ConnString: "file://" + t.TempDir()}, "mem://{{ .Topic }}", config.Thumbnail{})
	svc := &EntityService{repo: repos}
	group, err := repos.Groups.GroupCreate(context.Background(), "csv lifecycle", uuid.Nil)
	require.NoError(t, err)
	ctx := Context{Context: context.Background(), GID: group.ID}
	csv := "HB.import_ref,HB.location,HB.name,HB.quantity\nref-1,Room,Widget,1\n"
	_, err = svc.CsvImport(ctx, ctx.GID, strings.NewReader(csv))
	require.NoError(t, err)
	asset, err := repos.Entities.GetByRef(ctx, ctx.GID, "ref-1")
	require.NoError(t, err)
	wrong := Context{Context: ctx.Context, GID: uuid.New()}
	_, err = svc.Offboard(wrong, asset.ID, repo.EntityOffboard{Outcome: "sold", EffectiveDate: time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)})
	require.ErrorIs(t, err, repo.ErrInvalidLifecycleTransition)
	_, err = svc.Offboard(ctx, asset.ID, repo.EntityOffboard{Outcome: "custom", EffectiveDate: time.Now(), CustomReason: " "})
	require.ErrorIs(t, err, repo.ErrInvalidOffboarding)
	record, err := svc.Offboard(ctx, asset.ID, repo.EntityOffboard{Outcome: "donated", EffectiveDate: time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)})
	require.NoError(t, err)
	// Reimport of an existing asset must not reset its lifecycle or history.
	_, err = svc.CsvImport(ctx, ctx.GID, strings.NewReader(csv))
	require.NoError(t, err)
	stored, err := client.Entity.Get(ctx, asset.ID)
	require.NoError(t, err)
	require.True(t, stored.Offboarded)
	require.ErrorIs(t, svc.Reactivate(wrong, asset.ID), repo.ErrInvalidLifecycleTransition)
	_, err = svc.OffboardingHistory(wrong, asset.ID)
	require.Error(t, err)
	require.NoError(t, svc.Reactivate(ctx, asset.ID))
	history, err := svc.OffboardingHistory(ctx, asset.ID)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, record.ID, history[0].ID)
	require.Equal(t, record.Outcome, history[0].Outcome)
	require.NotNil(t, history[0].ReactivatedAt)
	stored, err = client.Entity.Get(ctx, asset.ID)
	require.NoError(t, err)
	require.False(t, stored.Offboarded)
}
