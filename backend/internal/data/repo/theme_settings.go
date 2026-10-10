package repo

// Must agree with the browser rollout marker. It is a version, not a timestamp
// or revision: a migrated client is free to choose a different theme.
const themeMigrationVersion = 1

func currentThemeMigration(value interface{}) bool {
	switch v := value.(type) {
	case float64:
		return v == themeMigrationVersion
	case int:
		return v == themeMigrationVersion
	default:
		return false
	}
}

func migrateThemeSettings(settings map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(settings)+2)
	for key, value := range settings {
		out[key] = value
	}
	if !currentThemeMigration(out["themeMigrationVersion"]) {
		out["theme"] = "claude"
	}
	if theme, ok := out["theme"].(string); !ok || theme == "" {
		out["theme"] = "claude"
	}
	out["themeMigrationVersion"] = themeMigrationVersion
	return out
}
