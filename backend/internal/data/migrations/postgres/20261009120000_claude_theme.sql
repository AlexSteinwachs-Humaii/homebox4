-- +goose Up
UPDATE users SET settings =
  (CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END)
  || '{"theme":"claude","themeMigrationVersion":1}'::jsonb
WHERE settings->'themeMigrationVersion' IS DISTINCT FROM '1'::jsonb;

-- +goose Down
-- Irreversible preference rollout; preserve later deliberate theme choices.
SELECT 1;
