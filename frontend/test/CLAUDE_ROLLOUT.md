# Claude default rollout (story 2)

`themeMigrationVersion: 1` is shared by the two SQL migrations, server settings
normalization, `lib/data/theme-preferences.ts`, and the synchronous
`public/set-theme.js` startup script. Incrementing this marker is a new global
rollout, not normal preference synchronization. The startup script and TypeScript
normalizer are checked for parity against every selectable theme.

- Legacy browser objects retain unrelated keys but replace their theme before
  initial paint. Missing, non-object, invalid JSON and invalid theme values use
  Claude. Storage exceptions do not stop theme application.
- Normalize local data before sync watchers so migration is not recorded as a
  deliberate edit. Auth hydration takes the server snapshot, except actual local
  changes made while fetching (including a theme selection) retain existing
  field-aware merge behavior.
- SQL upgrades update only theme and marker. Their downs intentionally do not
  recover discarded themes or reset later choices. Repeated upgrades preserve
  marked preferences. New users receive marked defaults at creation; the read
  path also covers absent settings.
- Server writes merge unrelated/unknown existing settings and reject theme
  changes from unmarked legacy payloads. Marked payloads may choose any theme.
  After rollout, old clients without the marker cannot change themes; they can
  still update other settings.
- The root palette applies only without `data-theme`; explicit Homebox and other
  themes continue to override the default.

## Verification on this branch

- `cd frontend && pnpm run test:theme`: 15 passing tests.
- `cd backend && go test ./internal/data/repo ./internal/data/migrations`: passes
  (PostgreSQL subtest skips without `TEST_POSTGRES_DSN`). SQLite SQL tests cover
  legacy/empty/non-object/malformed JSON, unrelated nested keys, and rerun after
  a deliberate post-migration theme change.
- `cd frontend && pnpm run lint:ci`: passes with the permitted single warning in
  `locales/zh-TW.test.ts`.
- `cd frontend && pnpm run build`: passes.
- `cd backend && go build ./app/api`: passes.
- `cd backend && go test ./...`: fails in `internal/sys/validate`:
  ```text
  --- FAIL: TestValidateNotifierURL/generic_notifier_with_public_IP_passes
  expected no error but got: bogon/reserved network addresses are blocked
  --- FAIL: TestValidateNotifierURL/generic_notifier_shorthand_host/path_passes
  expected no error but got: bogon/reserved network addresses are blocked
  ```
- `cd frontend && pnpm run typecheck`: fails with numerous errors outside the
  changed rollout files, for example:
  ```text
  components/Entity/CreateModal.vue(638,19): error TS18048: 'form.location' is possibly 'undefined'.
  components/Item/View/ItemChangeDetails.vue(64,28): error TS2339: Property 'location' does not exist on type 'EntitySummary'.
  components/Item/View/table/data-table-dropdown.vue(63,35): error TS2304: Cannot find name 'ItemSummary'.
  ```

For live PostgreSQL migration verification against an isolated test database:
`cd backend && TEST_POSTGRES_DSN='postgres://...' go test ./internal/data/migrations -run TestClaudeThemeMigration -v`.
It uses a temporary users table on one connection and does not modify permanent
users. No live PostgreSQL upgrade or browser end-to-end check was completed in
this story; the subsequent verification story covers those application flows.
