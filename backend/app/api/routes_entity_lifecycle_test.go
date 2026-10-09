package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hay-kot/httpkit/errchain"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting/eventbus"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/authroles"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entityoffboarding"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/usergroup"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
	"github.com/sysadminsmedia/homebox/backend/internal/web/mid"
	"github.com/sysadminsmedia/homebox/backend/pkgs/hasher"
)

// Exercise the registered production routes and their real auth/tenant/role
// middleware, rather than injecting an already-authorized service context.
func TestEntityLifecycleRoutes(t *testing.T) {
	ctx := context.Background()
	// Match startup initialization for the API-key fallback on invalid tokens.
	hasher.SetAPIKeyPepper([]byte("lifecycle-route-test-pepper-not-for-production"))
	client, err := ent.Open("sqlite3", "file:"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite&_pragma=busy_timeout=5000")
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Close() })
	require.NoError(t, client.Schema.Create(ctx))
	bus := eventbus.New()
	storage := config.Storage{PrefixPath: "/", ConnString: "file://" + t.TempDir()}
	repos := repo.New(client, bus, storage, "mem://{{ .Topic }}", config.Thumbnail{})
	a := new(&config.Config{Storage: storage})
	a.db, a.repos, a.bus = client, repos, bus
	a.services = services.New(repos)
	router := chi.NewRouter()
	a.mountRoutes(router, errchain.New(mid.Errors(zerolog.Nop())), repos)

	collection, err := client.Group.Create().SetName("primary").Save(ctx)
	require.NoError(t, err)
	other, err := client.Group.Create().SetName("other").Save(ctx)
	require.NoError(t, err)
	kind, err := client.EntityType.Create().SetName("item").SetGroupID(collection.ID).Save(ctx)
	require.NoError(t, err)
	asset, err := client.Entity.Create().SetName("retained asset").SetGroupID(collection.ID).SetEntityTypeID(kind.ID).SetSoldTo("legacy buyer").SetSoldNotes("legacy notes").SetArchived(true).Save(ctx)
	require.NoError(t, err)
	user, err := client.User.Create().SetName("inventory member").SetEmail("member@example.test").SetDefaultGroupID(collection.ID).Save(ctx)
	require.NoError(t, err)
	_, err = client.UserGroup.Create().SetUserID(user.ID).SetGroupID(collection.ID).Save(ctx)
	require.NoError(t, err)
	token := uuid.NewString()
	_, err = repos.AuthTokens.CreateToken(ctx, repo.UserAuthTokenCreate{UserID: user.ID, TokenHash: hasher.HashToken(token), ExpiresAt: time.Now().Add(time.Hour)}, authroles.RoleUser)
	require.NoError(t, err)
	noRole := uuid.NewString()
	_, err = repos.AuthTokens.CreateToken(ctx, repo.UserAuthTokenCreate{UserID: user.ID, TokenHash: hasher.HashToken(noRole), ExpiresAt: time.Now().Add(time.Hour)})
	require.NoError(t, err)
	expired := uuid.NewString()
	_, err = repos.AuthTokens.CreateToken(ctx, repo.UserAuthTokenCreate{UserID: user.ID, TokenHash: hasher.HashToken(expired), ExpiresAt: time.Now().Add(-time.Hour)}, authroles.RoleUser)
	require.NoError(t, err)
	path := "/api/v1/entities/" + asset.ID.String()
	valid := `{"outcome":"sold","effectiveDate":"2026-10-09","notes":"retained"}`
	request := func(method, suffix, body, auth, tenant string, status int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path+suffix, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		if auth != "" {
			r.Header.Set("Authorization", "Bearer "+auth)
		}
		if tenant != "" {
			r.Header.Set("X-Tenant", tenant)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		require.Equal(t, status, w.Code, "%s %s: %s", method, r.URL, w.Body.String())
		return w
	}
	assertState := func(offboarded bool, records int) {
		t.Helper()
		stored, err := client.Entity.Get(ctx, asset.ID)
		require.NoError(t, err)
		require.Equal(t, offboarded, stored.Offboarded)
		require.True(t, stored.Archived)
		require.Equal(t, "legacy buyer", stored.SoldTo)
		require.Equal(t, "legacy notes", stored.SoldNotes)
		count, err := client.EntityOffboarding.Query().Where(entityoffboarding.EntityID(asset.ID)).Count(ctx)
		require.NoError(t, err)
		require.Equal(t, records, count)
	}
	history := func() []repo.EntityOffboardingRecord {
		t.Helper()
		w := request(http.MethodGet, "/offboarding-history", "", token, "", http.StatusOK)
		var records []repo.EntityOffboardingRecord
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &records))
		return records
	}

	// All three endpoints require authentication, the inventory role, and
	// membership in the selected collection before reaching the controller.
	for _, operation := range []struct{ method, suffix, body string }{
		{http.MethodGet, "/offboarding-history", ""},
		{http.MethodPost, "/offboard", valid},
		{http.MethodPost, "/reactivate", ""},
	} {
		for _, auth := range []string{"", uuid.NewString(), expired} {
			request(operation.method, operation.suffix, operation.body, auth, "", http.StatusUnauthorized)
		}
		request(operation.method, operation.suffix, operation.body, noRole, "", http.StatusForbidden)
		request(operation.method, operation.suffix, operation.body, token, other.ID.String(), http.StatusForbidden)
		request(operation.method, operation.suffix, operation.body, token, "not-a-uuid", http.StatusBadRequest)
	}
	assertState(false, 0)
	// Even membership in both collections must not authorize an entity from a
	// different collection than X-Tenant; reads must not leak its history.
	_, err = client.UserGroup.Create().SetUserID(user.ID).SetGroupID(other.ID).Save(ctx)
	require.NoError(t, err)
	assertCrossCollection := func() {
		t.Helper()
		request(http.MethodGet, "/offboarding-history", "", token, other.ID.String(), http.StatusNotFound)
		request(http.MethodPost, "/offboard", valid, token, other.ID.String(), http.StatusNotFound)
		request(http.MethodPost, "/reactivate", "", token, other.ID.String(), http.StatusNotFound)
	}
	assertCrossCollection()
	for _, body := range []string{
		"{", "", `{"outcome":"unsupported","effectiveDate":"2026-10-09"}`,
		`{"outcome":"sold","effectiveDate":"2026-02-30"}`,
		`{"outcome":"sold","effectiveDate":"2026-10-09T00:00:00Z"}`,
		`{"outcome":"sold","effectiveDate":"0000-01-01"}`,
		`{"outcome":"sold"}`,
		`{"outcome":"custom","effectiveDate":"2026-10-09","customReason":" \n\t "}`,
	} {
		request(http.MethodPost, "/offboard", body, token, "", http.StatusBadRequest)
		assertState(false, 0)
	}
	request(http.MethodPost, "/reactivate", "", token, "", http.StatusConflict)
	require.Empty(t, history())
	previous := make([]repo.EntityOffboardingRecord, 0)
	for i, outcome := range []string{"sold", "donated", "disposed", "recycled", "lost", "custom"} {
		payload, err := json.Marshal(map[string]string{"outcome": outcome, "effectiveDate": "2026-10-09", "customReason": "retained reason", "notes": "retained notes"})
		require.NoError(t, err)
		response := request(http.MethodPost, "/offboard", string(payload), token, collection.ID.String(), http.StatusCreated)
		var created repo.EntityOffboardingRecord
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &created))
		require.Equal(t, outcome, created.Outcome)
		require.Nil(t, created.ReactivatedAt)
		assertState(true, i+1)
		request(http.MethodPost, "/offboard", string(payload), token, "", http.StatusConflict)
		assertCrossCollection()
		records := history()
		require.Len(t, records, i+1)
		require.Equal(t, previous, records[:i])
		require.Equal(t, created, records[i])
		request(http.MethodPost, "/reactivate", "", token, "", http.StatusNoContent)
		assertState(false, i+1)
		records = history()
		require.Equal(t, previous, records[:i])
		require.NotNil(t, records[i].ReactivatedAt)
		closed := records[i]
		closed.ReactivatedAt = nil
		require.Equal(t, created, closed, "reactivation may only close the current cycle")
		previous = records
		request(http.MethodPost, "/reactivate", "", token, "", http.StatusConflict)
		require.Equal(t, previous, history())
	}
	// Membership is read on each request; an existing session does not retain
	// access to a collection after its membership has been removed.
	_, err = client.UserGroup.Delete().Where(usergroup.UserID(user.ID), usergroup.GroupID(collection.ID)).Exec(ctx)
	require.NoError(t, err)
	request(http.MethodGet, "/offboarding-history", "", token, collection.ID.String(), http.StatusForbidden)
	request(http.MethodPost, "/offboard", valid, token, collection.ID.String(), http.StatusForbidden)
	request(http.MethodPost, "/reactivate", "", token, collection.ID.String(), http.StatusForbidden)
	assertState(false, 6)
}
