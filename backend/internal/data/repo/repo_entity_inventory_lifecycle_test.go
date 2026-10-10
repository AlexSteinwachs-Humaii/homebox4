package repo

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting/eventbus"
)

func TestLifecycleInventory(t *testing.T) {
	dialects := []string{"sqlite3"}
	if os.Getenv("OFFBOARDING_POSTGRES_DSN") != "" {
		dialects = append(dialects, "postgres")
	}
	for _, dialect := range dialects {
		t.Run(dialect, func(t *testing.T) {
			r, client, gid, id := lifecycleDatabase(t, dialect)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			r.bus = eventbus.New()
			events := make(chan uuid.UUID, 10)
			r.bus.Subscribe(eventbus.EventEntityMutation, func(data any) { events <- data.(eventbus.GroupMutationEvent).GID })
			go func() { _ = r.bus.Run(ctx) }()
			_, err := client.Entity.UpdateOneID(id).SetArchived(false).SetQuantity(3).SetPurchasePrice(10).Save(ctx)
			require.NoError(t, err)
			locType, err := client.EntityType.Create().SetName("room").SetDescription("").SetGroupID(gid).SetIsLocation(true).Save(ctx)
			require.NoError(t, err)
			loc, err := client.Entity.Create().SetName("room").SetDescription("").SetGroupID(gid).SetEntityTypeID(locType.ID).Save(ctx)
			require.NoError(t, err)
			_, err = client.Entity.UpdateOneID(id).SetParentID(loc.ID).Save(ctx)
			require.NoError(t, err)
			itemType, err := client.Entity.Get(ctx, id)
			require.NoError(t, err)
			et, err := itemType.QueryEntityType().Only(ctx)
			require.NoError(t, err)
			active, err := client.Entity.Create().SetName("active").SetGroupID(gid).SetEntityTypeID(et.ID).SetParentID(loc.ID).SetQuantity(2).SetPurchasePrice(5).Save(ctx)
			require.NoError(t, err)
			check := func(filter string, archived bool, total int) {
				t.Helper()
				result, err := r.QueryByGroup(ctx, gid, EntityQuery{Lifecycle: filter, IncludeArchived: archived, Page: 1, PageSize: 1, OrderBy: "createdAt"})
				require.NoError(t, err)
				require.Equal(t, total, result.Total)
				require.LessOrEqual(t, len(result.Items), 1)
			}
			check("", false, 2)
			data := EntityOffboard{Outcome: "donated", EffectiveDate: time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC), Notes: "retained"}
			first, err := r.OffboardByGroup(ctx, gid, id, data)
			require.NoError(t, err)
			select {
			case event := <-events:
				require.Equal(t, gid, event)
			case <-time.After(time.Second):
				t.Fatal("missing mutation event")
			}
			check("", false, 1)
			check("active", true, 1)
			check("all", false, 2)
			check("offboarded", false, 1)
			result, err := r.QueryByGroup(ctx, gid, EntityQuery{Search: "legacy", Page: -1, PageSize: -1})
			require.NoError(t, err)
			require.Zero(t, result.Total)
			result, err = r.QueryByGroup(ctx, gid, EntityQuery{Search: "legacy", Lifecycle: "offboarded", Page: -1, PageSize: -1})
			require.NoError(t, err)
			require.Equal(t, 1, result.Total)
			require.True(t, result.Items[0].Offboarded)
			detail, err := r.GetOneByGroup(ctx, gid, id)
			require.NoError(t, err)
			require.True(t, detail.Offboarded)
			require.Len(t, detail.OffboardingHistory, 1)
			require.Equal(t, first.ID, detail.OffboardingHistory[0].ID)
			counts, err := r.getChildItemCounts(ctx, gid, []uuid.UUID{loc.ID})
			require.NoError(t, err)
			require.Equal(t, float64(2), counts[loc.ID])
			isLoc := true
			locations, err := r.QueryByGroup(ctx, gid, EntityQuery{IsLocation: &isLoc, Page: -1, PageSize: -1})
			require.NoError(t, err)
			require.Len(t, locations.Items, 1)
			require.Equal(t, float64(2), locations.Items[0].ItemCount)
			stats, err := (&GroupRepository{db: client}).StatsGroup(ctx, gid)
			require.NoError(t, err)
			require.Equal(t, 1, stats.TotalItems)
			require.Equal(t, float64(10), stats.TotalItemPrice)
			require.Equal(t, 1, stats.TotalLocations)
			containers, err := r.GetAllContainers(ctx, gid, ContainerQuery{})
			require.NoError(t, err)
			require.Len(t, containers, 1)
			require.Equal(t, float64(2), containers[0].ItemCount)
			tree, err := r.Tree(ctx, gid, TreeQuery{WithItems: true})
			require.NoError(t, err)
			require.Len(t, tree, 1)
			require.Len(t, tree[0].Children, 1)
			require.Equal(t, active.ID, tree[0].Children[0].ID)
			groupRepo := &GroupRepository{db: client}
			locationPrices, err := groupRepo.StatsLocationsByPurchasePrice(ctx, gid)
			require.NoError(t, err)
			require.Len(t, locationPrices, 1)
			require.Equal(t, float64(5), locationPrices[0].Total)
			tag, err := client.Tag.Create().SetGroupID(gid).SetName("price").AddEntityIDs(id, active.ID).Save(ctx)
			require.NoError(t, err)
			tagPrices, err := groupRepo.StatsTagsByPurchasePrice(ctx, gid)
			require.NoError(t, err)
			require.Len(t, tagPrices, 1)
			require.Equal(t, tag.ID, tagPrices[0].ID)
			require.Equal(t, float64(5), tagPrices[0].Total)
			price, err := groupRepo.StatsPurchasePrice(ctx, gid, time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
			require.NoError(t, err)
			require.Equal(t, float64(5), price.PriceAtEnd)
			require.Len(t, price.Entries, 1)

			_, err = r.OffboardByGroup(ctx, uuid.New(), active.ID, data)
			require.Error(t, err)
			_, err = r.OffboardByGroup(ctx, gid, loc.ID, data)
			require.Error(t, err)
			_, err = r.OffboardByGroup(ctx, gid, id, data)
			require.Error(t, err)
			_, err = r.OffboardByGroup(ctx, gid, active.ID, EntityOffboard{})
			require.Error(t, err)
			_, err = r.OffboardingHistoryByGroup(ctx, uuid.New(), id)
			require.Error(t, err)
			select {
			case <-events:
				t.Fatal("failed transitions emitted mutation")
			default:
			}
			require.NoError(t, r.ReactivateByGroup(ctx, gid, id))
			select {
			case event := <-events:
				require.Equal(t, gid, event)
			case <-time.After(time.Second):
				t.Fatal("missing reactivation event")
			}
			check("", false, 2)
			check("offboarded", false, 0)
			_, err = client.Entity.UpdateOneID(id).SetArchived(true).Save(ctx)
			require.NoError(t, err)
			second, err := r.OffboardByGroup(ctx, gid, id, data)
			require.NoError(t, err)
			require.NotEqual(t, first.ID, second.ID)
			require.NoError(t, r.ReactivateByGroup(ctx, gid, id))
			check("", false, 1)
			check("all", true, 2)
			detail, err = r.GetOneByGroup(ctx, gid, id)
			require.NoError(t, err)
			require.True(t, detail.Archived)
			require.False(t, detail.Offboarded)
			require.Len(t, detail.OffboardingHistory, 2)
			require.Equal(t, first.ID, detail.OffboardingHistory[0].ID)
			require.Equal(t, second.ID, detail.OffboardingHistory[1].ID)
			for _, record := range detail.OffboardingHistory {
				require.NotNil(t, record.ReactivatedAt)
			}
			_, err = r.QueryByGroup(ctx, gid, EntityQuery{Lifecycle: "invalid"})
			require.ErrorIs(t, err, ErrInvalidLifecycleFilter)
		})
	}
}
