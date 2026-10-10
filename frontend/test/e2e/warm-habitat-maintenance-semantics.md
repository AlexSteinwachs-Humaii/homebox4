# Read-only collection maintenance — story 1

## Verified source contract

- `backend/app/api/handlers/v1/v1_ctrl_maintenance.go` passes the authenticated context's group ID to the repository; `/api/v1/maintenance?status=scheduled` returns authorized collection records, not sample data.
- `backend/internal/data/repo/repo_maintenance.go`: collection **scheduled** means completed date (`Date`) is nil or `time.Time{}`. There is no future-date predicate. **Completed** means non-nil/nonzero, not necessarily before today. Records are ordered by stored scheduled date. This page preserves that order, including undated and past dates; it does not calculate overdue/upcoming or pick a "next" task.
- Item `GetMaintenance` in `repo_maintenance_entry.go` has different filtering (also considers future completion dates). The existing item log remains unchanged; the collection schedule uses only the collection endpoint.
- `backend/internal/data/types/date.go` serializes scheduled/completed dates as `YYYY-MM-DD`, with zero dates as `""`. `maintenanceCalendarDate` accepts only a valid calendar-day string; unsupported/empty/invalid values receive an explicit no-recorded-date label. `DateTime`/`fmtDate` parse date-only strings through local calendar components, not UTC instants. No timestamps or guessed timezones are introduced.
- Scheduled records have no completion date to show. This story does not add a completed tab or alter completion-date rendering in the existing item log. Shared date-only tests cover the underlying calendar-day behavior.

## Design adaptation and remaining story

Screen 09's task/due-date/item/description hierarchy uses the already-merged Warm Habitat shell and card tokens. The illustrative Upcoming label becomes Scheduled with its meaning explained. No Schedule task button, fake Completed tab, statistics, example records, recurrence rules or mutations appear. The right panel explains the read-only view rather than fabricating a next item.

`MaintenanceEntryWithDetails` has item name/ID but no location. Actual authorized location/context enrichment, the item side-panel summary and inventory/item-detail entry points remain **story 2**, not inferred here. Item links already target the actual `/item/{itemID}` route; the existing `/item/{id}/maintenance` mutation workflow is preserved.

The schedule clears data synchronously on collection changes, recreates the API client for its new X-Tenant header, ignores stale requests and clears on disposal. Error responses, absent data and rejected requests are failures, never empty schedules. Retry is read-only. Entity mutation events and successful maintenance mutation response notifications refresh the schedule when mounted.

## Verification

- `pnpm run build`: passed (static Nuxt generation).
- `pnpm run lint`: passed, 0 errors; one unrelated existing formatting warning in `locales/zh-TW.test.ts:12`.
- `pnpm exec vitest --run --config ./test/vitest.config.ts composables/use-maintenance-schedule.test.ts lib/datelib/dateOnly.test.ts`: 17 tests passed; also passed with `TZ=America/Los_Angeles` and `TZ=Pacific/Auckland`.
- Chromium Playwright against the generated frontend with explicit intercepted API fixtures: `pnpm exec playwright test --config test/playwright.config.ts warm-habitat-schedule-readonly.browser.spec.ts --project chromium --reporter line`: passed. Covers date preservation west of UTC, past/undated entries, stored ordering, real field rendering, associated route, no maintenance mutations, mobile overflow and loading/error/retry/empty. This is presentation/lifecycle testing, not a live backend authorization test.
- `pnpm run typecheck`: failed with repository-wide diagnostics, none naming the new schedule files or changed maintenance page. Examples of actual output:

```text
pages/tag/[id].vue(284,25): error TS2322: Type 'Ref<TagOut | undefined, TagOut | undefined>' is not assignable to type 'TagOut | TagSummary'.
pages/templates.vue(20,5): error TS2322: Type 'ComputedRef<string>' is not assignable to type 'ResolvableTitle'.
test/e2e/warm-habitat-item-details.browser.spec.ts(24,24): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
ELIFECYCLE Command failed with exit code 2.
```

No backend or generated contracts changed; no full API integration or cross-browser walk is claimed.
