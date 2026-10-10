# Claude rollout verification — story 3

Verified on 2026-10-10 against this branch's generated frontend and compiled API,
using a disposable SQLite database. This story adds verification only; it does not
change the theme rollout or inventory behavior.

## Browser coverage and results

Focused Chromium run: **11 passed**, no retries, one worker.

```sh
cd frontend
pnpm exec playwright install chromium
E2E_BASE_URL=http://localhost:7745 pnpm exec playwright test \
  -c test/playwright.config.ts --project=chromium --workers=1 --retries=0 \
  --reporter=line,html claude-theme.browser.spec.ts \
  asset-offboarding.browser.spec.ts recently-added.browser.spec.ts
```

The API must serve this branch's built frontend, allow registration, and enable
`HBOX_DEMO=true` for the existing Recently Added tests' demo login. This sandbox
uses `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`; omit that variable on machines
using Playwright's default cache. Standard repository orchestration is
`task test:e2e -- <specs> --project=chromium`.

Coverage:
- Missing storage, malformed JSON, and a legacy Dark snapshot: Claude is set by
  the synchronous startup script with Nuxt scripts blocked (CSS remains enabled),
  then after real registration/login, authenticated hydration and reload.
- Legacy browser theme replacement retains an unrelated local flag and unknown
  key. A stale browser snapshot cannot restore Dark over migrated server settings;
  server page-size, flag and nested unknown settings survive hydration.
- Missing server preference is explicitly simulated by returning `{ item: {} }`.
  A real fresh account separately verifies marked Claude settings from the API.
- A **manual picker click on Night** is saved to the real API, survives reload,
  and hydrates in an independent browser context after login and reload. The new
  context shows Claude before login, then the deliberate Night choice afterward.
- Lifecycle tests at **1440px and 390px** assert Claude, dialog focus and viewport
  bounds, client/server errors and retry, all six offboarding outcomes, retained
  notes/history across reload/reactivation, and active/offboarded discovery.
  They now assert homepage Asset ID in the desktop row and mobile card.
- Existing Recently Added checks cover default/missing/hidden Asset ID headers
  and desktop, phone, small tablet, tablet and item navigation.

The lifecycle tests attach desktop/mobile homepage and validation-dialog PNGs to
`frontend/playwright-report/` (`pnpm exec playwright show-report`). All four were
visually reviewed in this run: cream surfaces, terracotta controls, readable dark
text, visible Asset ID, error text and dialog buttons fit both widths. Reports
are generated artifacts, not committed snapshots.

## Actual SQLite migration + browser verification

The new upgrade test requires a pre-upgrade seed and fails rather than silently
skipping when it is absent. `create-test-data.sh` now writes Dark plus unrelated
settings to the **old** API without a marker and records the expected settings.
The normal config now selects `test/upgrade` when `TEST_DATA_FILE` is supplied
(as in the unchanged upgrade workflow); previously its `testDir: ./e2e` excluded
upgrade tests even when a filename was passed. A dedicated
`test/playwright.upgrade.config.ts` also supports explicit local runs.

```sh
cd frontend
TEST_DATA_FILE=/tmp/test-users.json E2E_BASE_URL=http://localhost:7745 \
  pnpm exec playwright test -c test/playwright.upgrade.config.ts \
  --project=chromium --workers=1 --retries=0 --grep 'Claude replaces'
```

Result here: **1 passed** against a live SQLite upgrade fixture. For this run a
registered test user's database settings were seeded with Dark, `showEmpty:false`,
`itemsPerTablePage:24` and a nested sentinel while the API was stopped. Only the
Claude migration entry (`20261009120000`) was removed from that disposable
fixture's Goose ledger. Restarting the compiled API ran the actual SQL migration;
the browser test then verified migrated server settings, legacy local replacement,
unrelated settings and authenticated reload. This is a real SQL-to-browser
fixture check, **not** a claim of testing a released production image upgrade.
The full Docker old-release workflow remains to be run in CI.

## Automated checks

| Command | Result |
| --- | --- |
| `cd frontend && pnpm run test:theme` | 15 passed |
| `cd frontend && pnpm run test:ci` | 24 files, 109 tests passed against live non-demo API |
| `cd frontend && pnpm run lint:ci` | Passed; one permitted existing `locales/zh-TW.test.ts` formatting warning |
| `cd frontend && pnpm run build` | Passed |
| `cd backend && go build ./app/api` | Passed |
| `cd backend && go test ./internal/data/repo ./internal/data/migrations` | Passed |
| `cd backend && go test ./internal/data/migrations -run TestClaudeThemeMigration -v` | SQLite passed; PostgreSQL skipped: `TEST_POSTGRES_DSN not configured` |
| `cd frontend && pnpm run typecheck` | Failed in existing non-verification files (examples below) |
| `cd backend && go test ./...` | Failed in notifier URL validation (below) |

The main Vitest config now resolves `~` and the preferences test declares jsdom,
so these checks work through both `test:theme` and the normal `test:ci` entrypoint.
For integration tests, use a disposable live backend with registration enabled,
`HBOX_DEMO=false`, and the repository's development password-projection setting.
Do not use a production database. `test:ci` teardown may stop API processes.

Remaining failure output:

```text
components/Entity/CreateModal.vue(638,19): error TS18048: 'form.location' is possibly 'undefined'.
components/Item/View/ItemChangeDetails.vue(64,28): error TS2339: Property 'location' does not exist on type 'EntitySummary'.
components/Item/View/table/data-table-dropdown.vue(63,35): error TS2304: Cannot find name 'ItemSummary'.
```

Typecheck reports additional existing errors, but none in this story's test/config
files. These examples match the story 2 baseline in `CLAUDE_ROLLOUT.md`.

```text
--- FAIL: TestValidateNotifierURL/generic_notifier_with_public_IP_passes
    notifier_url_test.go:428: expected no error but got: bogon/reserved network addresses are blocked
--- FAIL: TestValidateNotifierURL/generic_notifier_shorthand_host/path_passes
    notifier_url_test.go:428: expected no error but got: bogon/reserved network addresses are blocked
```

Resolved verification/setup failures (not product fixes):
- First browser run: `Executable doesn't exist at /opt/ms-playwright/chromium_headless_shell-1234/...`.
  Installed this package's Chromium revision and reran successfully.
- Picker test initially targeted Dark, which is in the legacy theme union but is
  not a current picker option: `locator.click: Test timeout of 30000ms exceeded`.
  Changed the test to the selectable Night option; persistence then passed.
- Initial lint run: `ESLint found too many warnings (maximum: 1)` after formatting
  with default Prettier settings. Applied repository ESLint formatting; lint passed.
- Initial push rejected a workflow edit: `refusing to allow a GitHub App to create
  or update workflow ... without workflows permission`. Left the workflow unchanged
  and moved its upgrade discovery fix into Playwright config using the workflow's
  existing `TEST_DATA_FILE` environment variable.
- Initial normal Vitest run: `ReferenceError: document is not defined` in the
  preferences tests. Added their jsdom directive and normal-config alias.
- Running API integration checks against the demo server produced
  `expected 403 to be 204` for account deletion and a password-change failure.
  An attempted second server initially returned `bind: address already in use`.
  Stopped the first server, confirmed `demo:false` from `/api/v1/status`, and reran:
  **109 passed**.

## Remaining review checks

1. Run the full Docker upgrade workflow from an old released image, including its
   non-theme inventory checks. Source changes alone do not establish that result.
2. Run live PostgreSQL migration checks with `TEST_POSTGRES_DSN` against an isolated
   test database; the executable test uses a temporary users table. No PostgreSQL
   run was completed here.
3. Run the browser specs with `--project=firefox` and `--project=webkit` after
   installing those browsers; only Chromium was exercised here. Mobile coverage
   here is a Chromium viewport, not physical-device or mobile Safari verification.
4. Human visual/accessibility review on native devices: keyboard focus, native
   date-picker affordance (its calendar glyph is faint in the captured Chromium
   dialog), OS zoom/high contrast and screen-reader announcements. Field labels,
   dates, error text and action buttons were readable in the captured views;
   this is not a complete accessibility audit.
