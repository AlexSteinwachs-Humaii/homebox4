package v1

import (
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFilteredReportingQuerySnapshot(t *testing.T) {
	tagID, parentID := uuid.New(), uuid.New()
	r := httptest.NewRequest("GET", "/?q=needle&orderBy=updatedAt&page=3&pageSize=5&includeArchived=true&negateTags=true&onlyWithoutPhoto=true&filterChildren=true&isLocation=false&fields=Color%3Dred%3Dblue&tags="+tagID.String()+"&parentIds="+parentID.String(), nil)
	query := extractEntityQuery(r)
	require.Equal(t, "needle", query.Search)
	require.Equal(t, "updatedAt", query.OrderBy)
	require.Equal(t, []uuid.UUID{tagID}, query.TagIDs)
	require.Equal(t, []uuid.UUID{parentID}, query.ParentIDs)
	require.True(t, query.IncludeArchived)
	require.True(t, query.NegateTags)
	require.True(t, query.OnlyWithoutPhoto)
	require.True(t, query.FilterChildren)
	require.NotNil(t, query.IsLocation)
	require.False(t, *query.IsLocation)
	require.Equal(t, "red=blue", query.Fields[0].Value)
	r.URL.RawQuery = "q=changed&orderBy=name&fields=other%3Dchanged"
	require.Equal(t, "needle", query.Search)
	require.Equal(t, "updatedAt", query.OrderBy)
	require.Equal(t, "red=blue", query.Fields[0].Value)
}

func TestFilteredReportingAssetSearch(t *testing.T) {
	r := httptest.NewRequest("GET", "/?q=%23000001", nil)
	query := extractEntityQuery(r)
	require.Empty(t, query.Search)
	require.EqualValues(t, 1, query.AssetID)
}

func TestFilteredReportingRequiresAuthenticatedCollection(t *testing.T) {
	ctrl := &V1Controller{}
	err := ctrl.HandleFilteredReportingExport()(httptest.NewRecorder(), httptest.NewRequest("GET", "/", nil))
	require.Error(t, err) // Must fail before accessing the repository.
}
