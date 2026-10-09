package repo

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestQueryAllByGroupFilteredReporting(t *testing.T) {
	ctx := context.Background()
	g, err := tRepos.Groups.GroupCreate(ctx, "filtered-report", uuid.Nil)
	require.NoError(t, err)
	other, err := tRepos.Groups.GroupCreate(ctx, "other-report", uuid.Nil)
	require.NoError(t, err)
	et, err := tRepos.EntityTypes.GetDefault(ctx, g.ID, false)
	require.NoError(t, err)
	reportTag, err := tRepos.Tags.Create(ctx, g.ID, TagCreate{Name: "report-tag"})
	require.NoError(t, err)
	for i := 0; i < 37; i++ {
		_, err = tRepos.Entities.Create(ctx, g.ID, EntityCreate{Name: fmt.Sprintf("match-%02d", i), Quantity: 1, EntityTypeID: et.ID, TagIDs: []uuid.UUID{reportTag.ID}})
		require.NoError(t, err)
	}
	_, err = tRepos.Entities.Create(ctx, g.ID, EntityCreate{Name: "excluded", EntityTypeID: et.ID})
	require.NoError(t, err)
	_, err = tRepos.Entities.Create(ctx, other.ID, EntityCreate{Name: "match-secret"})
	require.NoError(t, err)
	for _, order := range []string{"name", "assetId", "createdAt", "updatedAt"} {
		t.Run(order, func(t *testing.T) {
			query := EntityQuery{Search: "match-", TagIDs: []uuid.UUID{reportTag.ID}, OnlyWithoutPhoto: true, OrderBy: order, Page: 2, PageSize: 5}
			page, err := tRepos.Entities.QueryByGroup(ctx, g.ID, query)
			require.NoError(t, err)
			require.Len(t, page.Items, 5)
			all, err := tRepos.Entities.QueryAllByGroup(ctx, g.ID, query)
			require.NoError(t, err)
			require.Len(t, all, 37)
			require.Equal(t, 2, query.Page)
			require.Equal(t, page.Items, all[5:10])
			seen := map[uuid.UUID]bool{}
			for _, item := range all {
				require.False(t, seen[item.ID])
				seen[item.ID] = true
				require.NotEqual(t, "match-secret", item.Name)
			}
		})
	}
	for _, query := range []EntityQuery{
		{Search: "does-not-exist"},
		{Search: "match-", TagIDs: []uuid.UUID{reportTag.ID}, NegateTags: true},
		{Search: "match-", OnlyWithPhoto: true},
		{Search: "match-", ParentIDs: []uuid.UUID{uuid.New()}},
		{Search: "match-", TagIDs: []uuid.UUID{uuid.New()}},
		{Search: "match-", Fields: []FieldQuery{{Name: "missing", Value: "value"}}},
	} {
		all, err := tRepos.Entities.QueryAllByGroup(ctx, g.ID, query)
		require.NoError(t, err)
		require.Empty(t, all)
	}
}
