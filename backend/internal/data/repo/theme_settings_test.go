package repo

import (
	"context"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestThemeSettingsRollout(t *testing.T) {
	ctx := context.Background()
	usr, err := tRepos.Users.Create(ctx, userFactory())
	require.NoError(t, err)
	// Seed a legacy snapshot directly, as an upgrade would find it.
	err = tClient.User.UpdateOneID(usr.ID).SetSettings(map[string]interface{}{
		"theme": "dark", "language": "de", "unknown": map[string]interface{}{"keep": true},
	}).Exec(ctx)
	require.NoError(t, err)
	settings, err := tRepos.Users.GetSettings(ctx, usr.ID)
	require.NoError(t, err)
	require.Equal(t, "claude", settings["theme"])
	require.Equal(t, "de", settings["language"])
	require.Equal(t, map[string]interface{}{"keep": true}, settings["unknown"])
	require.NoError(t, tRepos.Users.SetSettings(ctx, usr.ID, map[string]interface{}{"theme": "dark", "itemsPerTablePage": 24}))
	settings, err = tRepos.Users.GetSettings(ctx, usr.ID)
	require.NoError(t, err)
	require.Equal(t, "claude", settings["theme"])
	require.Equal(t, "de", settings["language"])
	require.NoError(t, tRepos.Users.SetSettings(ctx, usr.ID, map[string]interface{}{"theme": "dark", "themeMigrationVersion": 1}))
	// Both repeated reads and stale writes must preserve a later explicit choice.
	require.NoError(t, tRepos.Users.SetSettings(ctx, usr.ID, map[string]interface{}{"theme": "light"}))
	settings, err = tRepos.Users.GetSettings(ctx, usr.ID)
	require.NoError(t, err)
	require.Equal(t, "dark", settings["theme"])
	require.Equal(t, "de", settings["language"])
}

func TestThemeSettingsDefaults(t *testing.T) {
	require.Equal(t, "claude", migrateThemeSettings(nil)["theme"])
	original := map[string]interface{}{"theme": "light", "language": "fr"}
	migrated := migrateThemeSettings(original)
	require.Equal(t, "light", original["theme"])
	require.Equal(t, "claude", migrated["theme"])
	migrated["theme"] = "dark"
	require.Equal(t, "dark", migrateThemeSettings(migrated)["theme"])
}
