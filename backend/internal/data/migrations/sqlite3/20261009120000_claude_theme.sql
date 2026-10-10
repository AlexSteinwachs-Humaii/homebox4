-- +goose Up
-- Replace only the theme and rollout marker; retain arbitrary user settings.
UPDATE users SET settings = json_set(
  CASE WHEN json_valid(settings) AND json_type(settings) = 'object' THEN settings ELSE '{}' END,
  '$.theme', 'claude', '$.themeMigrationVersion', 1)
WHERE COALESCE(json_extract(CASE WHEN json_valid(settings) THEN settings ELSE '{}' END, '$.themeMigrationVersion'), 0) != 1;

-- +goose Down
-- Deliberately irreversible: previous themes cannot be recovered, and later
-- explicit choices must not be reset on rollback/re-upgrade.
SELECT 1;
