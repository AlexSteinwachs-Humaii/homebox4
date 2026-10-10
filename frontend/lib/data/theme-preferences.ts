import { themes } from "./themes";

export const THEME_MIGRATION_VERSION = 1;
export const PREFERENCE_STORAGE_KEY = "homebox/preferences/location";

// A migration is not a user edit. Normalize before installing sync watchers.
export function normalizeThemePreferences(value: unknown): Record<string, unknown> {
  const preferences =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? ({ ...value } as Record<string, unknown>)
      : {};
  if (
    preferences.themeMigrationVersion !== THEME_MIGRATION_VERSION ||
    !themes.some(t => t.value === preferences.theme)
  ) {
    preferences.theme = "claude";
  }
  preferences.themeMigrationVersion = THEME_MIGRATION_VERSION;
  return preferences;
}
