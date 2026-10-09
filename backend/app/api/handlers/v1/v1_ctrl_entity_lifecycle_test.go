package v1

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
)

func TestOffboardRequestValidation(t *testing.T) {
	for _, outcome := range []string{"sold", "donated", "disposed", "recycled", "lost", "custom"} {
		data, err := (EntityOffboardRequest{Outcome: outcome, EffectiveDate: "2026-10-09", CustomReason: "valid", Notes: "retained"}).transition()
		require.NoError(t, err)
		require.Equal(t, outcome, data.Outcome)
	}
	for _, input := range []EntityOffboardRequest{
		{Outcome: "sold"},
		{Outcome: "sold", EffectiveDate: "2026-02-30"},
		{Outcome: "sold", EffectiveDate: "2026-10-09T12:00:00Z"},
		{Outcome: "invalid", EffectiveDate: "2026-10-09"},
		{Outcome: "custom", EffectiveDate: "2026-10-09", CustomReason: " \n "},
		{Outcome: "sold", EffectiveDate: "2026-10-09", Notes: strings.Repeat("x", 1001)},
	} {
		_, err := input.transition()
		var requestError *validate.RequestError
		require.ErrorAs(t, err, &requestError)
		require.Equal(t, http.StatusBadRequest, requestError.Status)
	}
}

func TestLifecycleRejectsMalformedRequestsBeforeAccess(t *testing.T) {
	ctrl := &V1Controller{}
	for _, body := range []string{"{", "", `{"outcome":"sold","effectiveDate":"bad"}`} {
		router := chi.NewRouter()
		router.Post("/entities/{id}/offboard", func(w http.ResponseWriter, r *http.Request) {
			err := ctrl.HandleEntityOffboard()(w, r)
			var requestError *validate.RequestError
			require.ErrorAs(t, err, &requestError)
			require.Equal(t, http.StatusBadRequest, requestError.Status)
		})
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/entities/00000000-0000-0000-0000-000000000001/offboard", strings.NewReader(body)))
	}
	require.Nil(t, lifecycleError(nil))
	var conflict *validate.RequestError
	require.True(t, errors.As(lifecycleError(repo.ErrInvalidLifecycleTransition), &conflict))
	require.Equal(t, http.StatusConflict, conflict.Status)
	err := (&V1Controller{}).HandleEntitiesGetAll()(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/entities?lifecycle=unknown", nil))
	var badQuery *validate.RequestError
	require.ErrorAs(t, err, &badQuery)
	require.Equal(t, http.StatusBadRequest, badQuery.Status)
}
