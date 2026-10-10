package repo

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Exercise every page, not just the first page's count: filtering a paginated
// response instead of the query would otherwise pass small inventory tests.
func TestInventoryDiscoveryPagination(t *testing.T) {
	dialects := []string{"sqlite3"}
	if os.Getenv("OFFBOARDING_POSTGRES_DSN") != "" {
		dialects = append(dialects, "postgres")
	}
	for _, dialect := range dialects {
		t.Run(dialect, func(t *testing.T) {
			r, client, gid, legacyID := lifecycleDatabase(t, dialect)
			ctx := context.Background()
			legacy, err := client.Entity.Get(ctx, legacyID)
			require.NoError(t, err)
			typ, err := legacy.QueryEntityType().Only(ctx)
			require.NoError(t, err)
			detail, err := r.GetOneByGroup(ctx, gid, legacyID)
			require.NoError(t, err)
			require.True(t, detail.Archived)
			require.False(t, detail.Offboarded)
			require.Empty(t, detail.OffboardingHistory)

			activeIDs, offboardedIDs := []uuid.UUID{}, []uuid.UUID{}
			for i := 0; i < 7; i++ {
				item, err := client.Entity.Create().SetName("discovery").SetGroupID(gid).SetEntityTypeID(typ.ID).SetQuantity(1).SetPurchasePrice(10).Save(ctx)
				require.NoError(t, err)
				if i%2 == 0 {
					_, err = r.OffboardByGroup(ctx, gid, item.ID, EntityOffboard{Outcome: "lost", EffectiveDate: time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)})
					require.NoError(t, err)
					offboardedIDs = append(offboardedIDs, item.ID)
				} else {
					activeIDs = append(activeIDs, item.ID)
				}
			}
			// A child is not implicitly offboarded when its parent leaves inventory.
			_, err = client.Entity.UpdateOneID(activeIDs[0]).SetParentID(offboardedIDs[0]).Save(ctx)
			require.NoError(t, err)

			checkPages := func(filter string, archived bool, expected []uuid.UUID) {
				t.Helper()
				for _, order := range []string{"name", "createdAt", "updatedAt", "assetId"} {
					seen := []uuid.UUID{}
					for page := 1; page <= (len(expected)+1)/2+1; page++ {
						result, err := r.QueryByGroup(ctx, gid, EntityQuery{Lifecycle: filter, IncludeArchived: archived, Page: page, PageSize: 2, OrderBy: order})
						require.NoError(t, err)
						require.Equal(t, len(expected), result.Total)
						require.Equal(t, page, result.Page)
						require.Equal(t, 2, result.PageSize)
						require.LessOrEqual(t, len(result.Items), 2)
						for _, item := range result.Items {
							seen = append(seen, item.ID)
							if filter == "offboarded" {
								require.True(t, item.Offboarded)
							}
							if filter == "" || filter == "active" {
								require.False(t, item.Offboarded)
							}
							opened, err := r.GetOneByGroup(ctx, gid, item.ID)
							require.NoError(t, err)
							require.Equal(t, item.Offboarded, opened.Offboarded)
						}
					}
					require.ElementsMatch(t, expected, seen, "order=%s lifecycle=%s", order, filter)
				}
			}
			all := append(append([]uuid.UUID{}, activeIDs...), offboardedIDs...)
			checkPages("", false, activeIDs)
			checkPages("active", true, append(append([]uuid.UUID{}, activeIDs...), legacyID))
			checkPages("offboarded", false, offboardedIDs)
			checkPages("offboarded", true, offboardedIDs)
			checkPages("all", false, all)
			checkPages("all", true, append(append([]uuid.UUID{}, all...), legacyID))
			stats, err := (&GroupRepository{db: client}).StatsGroup(ctx, gid)
			require.NoError(t, err)
			require.Equal(t, 3, stats.TotalItems)
			require.Equal(t, float64(30), stats.TotalItemPrice)

			returnedID := offboardedIDs[0]
			require.NoError(t, r.ReactivateByGroup(ctx, gid, returnedID))
			checkPages("", false, append(activeIDs, returnedID))
			checkPages("offboarded", true, offboardedIDs[1:])
			returned, err := r.GetOneByGroup(ctx, gid, returnedID)
			require.NoError(t, err)
			require.False(t, returned.Offboarded)
			require.Len(t, returned.OffboardingHistory, 1)
			require.NotNil(t, returned.OffboardingHistory[0].ReactivatedAt)
			stats, err = (&GroupRepository{db: client}).StatsGroup(ctx, gid)
			require.NoError(t, err)
			require.Equal(t, 4, stats.TotalItems)
			require.Equal(t, float64(40), stats.TotalItemPrice)
		})
	}
}
