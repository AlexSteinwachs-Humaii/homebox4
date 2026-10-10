# Capture journey regression checks

Story: Validate the capture journey and persistent outcome.

## Coverage

- `warm-habitat-capture.browser.spec.ts`: four deterministic API-fixture tests for validation, rejected creation, Cancel, concurrent submission, update-only retry, uncertain creation and collection switching. The fixture tests assert writes/tenants; they are not evidence of database persistence.
- The same spec has two **live API** tests (Overview and Inventory). Each registers a unique user, creates its own location/tag, uses the routed form, double-clicks Save, returns through Inventory and reloads the canonical detail route. Assertions cover name, description, fractional quantity, type, parent, tags, zero purchase price, date-only purchase date, vendor, insured, and exactly one matching stored item. No entity responses are intercepted in these tests.
- `lib/api/__test__/user/item-capture.test.ts`: independent users/collections; foreign type, parent and tag references are rejected by both POST and supplemental PUT. Rejected POSTs do not add records; rejected PUTs leave authorized references unchanged; a foreign user cannot read the saved item.
- `composables/use-item-capture.test.ts`: unauthorized references cause no writes and preserve input, including after a partial save. Existing tests cover blank optional fields, transport errors, repeated submit and stale responses on collection switches.
- Existing `warm-habitat-item-form.browser.spec.ts` checks blank defaults, nested-page isolation, currency, unauthorized location hints, Cancel/back without writes and mobile layout.

The saved outcome is `/item/{real-id}`. The later confirmation enhancement is not assumed to exist. No production UI/schema changes are introduced by this story.

## Running

Use an isolated disposable database with registration enabled. The live tests create unique accounts, not demo-user/shared production records. Build frontend assets and embed them in the backend, matching the repository E2E workflow:

```sh
cd frontend
pnpm run build
cp -r .output/public ../backend/app/api/static/
cd ../backend
go build -o /tmp/capture-api ./app/api
HBOX_WEB_PORT=7745 HBOX_OPTIONS_ALLOW_REGISTRATION=true \
  HBOX_AUTH_API_KEY_PEPPER='dev-only-pepper-not-for-production-use-32b+' \
  HBOX_DATABASE_SQLITE_PATH='/tmp/capture-test.db?_pragma=busy_timeout=1000&_pragma=journal_mode=WAL&_fk=1&_time_format=sqlite' \
  HBOX_DEMO=false UNSAFE_DISABLE_PASSWORD_PROJECTION=yes_i_am_sure /tmp/capture-api
```

In another terminal, from `frontend`:

```sh
pnpm exec playwright install chromium
E2E_BASE_URL=http://localhost:7745 pnpm exec playwright test \
  -c test/playwright.config.ts warm-habitat-capture.browser.spec.ts \
  warm-habitat-item-form.browser.spec.ts --project=chromium --workers=1 --retries=0 --reporter=list
pnpm exec vitest --run --config ./test/vitest.config.ts --no-file-parallelism
pnpm run lint
pnpm run typecheck
```

Leave `TEST_SHUTDOWN_API_SERVER` unset when sharing the server between these checks.

## Verified results

- Frontend static build and backend build: passed. First backend link attempt reported `mapping output file failed: no space left on device`; retry succeeded.
- Chromium: **8 passed**, including both live persistence journeys.
- Full Vitest: **25 files / 158 tests passed** against the non-demo WAL/busy-timeout server.
- Lint: exit 0, one existing formatting warning in `locales/zh-TW.test.ts`; changed test files have no lint findings.
- Typecheck: exit 2, **169 errors outside the changed capture tests**. Examples:
  - `components/Entity/CreateModal.vue(638,19): error TS18048: 'form.location' is possibly 'undefined'.`
  - `components/Item/View/ItemChangeDetails.vue(64,28): error TS2339: Property 'location' does not exist on type 'EntitySummary'.`
  - `components/Maintenance/ListView.vue(185,58): error TS2339: Property 'id' does not exist on type 'true | MaintenanceEntryWithDetails[]'.`
- Initial full Vitest run against a demo-mode database without WAL/busy-timeout failed four existing tests: user deletion returned 403 (expected 204), password change returned an error, entity-type fetch returned 500 (expected 200), and an unhandled cleanup returned 500 (expected 204). Server output included `database is locked (5) (SQLITE_BUSY)`. All passed after correcting the test-server configuration above.
- Firefox/WebKit were not run.
