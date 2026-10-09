package v1

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
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

func TestCSVPresentationRejectsControlsBeforeQuery(t *testing.T) {
	r := httptest.NewRequest("GET", "/?presentation=%7B%22columns%22%3A%5B%7B%22id%22%3A%22actions%22%2C%22label%22%3A%22Actions%22%7D%5D%7D", nil)
	_, err := parseCSVPresentation(r)
	require.Error(t, err)
	_, err = parseCSVPresentation(httptest.NewRequest("GET", "/?presentation=broken", nil))
	require.Error(t, err)
}

func TestFilteredCSVDownloadHeaders(t *testing.T) {
	w := httptest.NewRecorder()
	_, err := writeFilteredCSV(w, []byte("Name\n雪\n"), time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, "text/csv; charset=utf-8", w.Header().Get("Content-Type"))
	require.Equal(t, "attachment; filename=filtered-report-2026-10-09.csv", w.Header().Get("Content-Disposition"))
	require.Equal(t, "Name\n雪\n", w.Body.String())
}

func TestInvalidExportIsNotSuccessfulDownload(t *testing.T) {
	ctrl := &V1Controller{}
	r := httptest.NewRequest("GET", "/?presentation=broken", nil)
	r = r.WithContext(services.SetUserCtx(r.Context(), &repo.UserOut{ID: uuid.New(), DefaultGroupID: uuid.New()}, ""))
	w := httptest.NewRecorder()
	err := ctrl.HandleFilteredReportingExport()(w, r)
	require.Error(t, err)
	require.Empty(t, w.Header().Get("Content-Disposition"))
	require.Empty(t, w.Header().Get("Content-Type"))
	require.Empty(t, w.Body.String())
}
