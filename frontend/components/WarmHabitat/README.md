# Shared presentation patterns

Import components explicitly (Nuxt page/component auto-import is disabled). These
patterns contain no household data, routing, permissions, or persistence. They
adapt to the selected theme using the existing semantic tokens; **do not** add
Warm Habitat hex values to pages. Warm Habitat is opt-in in the profile theme
picker. Existing Homebox defaults and local/server preference sync are unchanged.

- `Panel.vue`: existing shadcn Card with border, theme radius, optional `header`
  and `footer` slots. Put an `h2.habitat-heading` in the header and use padding on
  the body as needed. Warm Habitat panels have a 16px radius.
- `DataTable.vue`: Panel + existing Table (including horizontal overflow). Supply
  a required translated `caption` and existing TableHeader/TableBody/TableRow/
  TableHead/TableCell primitives in the default slot. Pagination belongs in
  `footer`. It does not replace the inventory table's sorting/filtering logic.
- `FormGroup.vue`: native fieldset/legend with a required translated `title` and
  optional `description`. Supply existing labeled inputs/selects in the slot;
  the group title is **not** a substitute for individual control labels.
- `ItemContext.vue`: editorial page title, optional description, `breadcrumb`,
  `metadata` and `actions` slots. Consumers own real location trails, routes,
  accessible breadcrumb labels and item data. Actions wrap on small screens.
- `Feedback.vue`: required translated `title`, `tone` (`info`, `success`, `error`),
  message slot and optional `actions`. Status/alert semantics and distinct icons
  convey tone without relying on branding red. Include the result/error in the
  title (for example, a translated “Item saved”), not only in its icon.

Use `habitat-heading` for editorial section titles and `habitat-link` (or
`text-link`) for links. Data/controls stay system-sans. Link color falls back to
primary for existing themes; `--link` is pale red in Warm Habitat. The palette,
fonts, radius and pattern classes live in `assets/css/main.css` and
`tailwind.config.js`, not in these components. Existing forms, cards, tables,
sidebar and toast primitives already consume the same semantic palette.

The authenticated shell now uses these tokens; the nine route-specific redesigns
remain separate work.

## Accessibility regression checks

`test/e2e/warm-habitat-shell.browser.spec.ts` exercises real shared components in
`test/fixtures/shared-patterns.vue`, plus the authenticated shell and collection
picker. The fixture route `/__test/shared-patterns` is registered **only** when
`HBOX_TEST_SHARED_PATTERNS=true` during Nuxt build/dev; normal builds contain no
fixture route. The spec is skipped without the same flag during Playwright.

With a demo-enabled backend and frontend running, from `frontend`:

```sh
HBOX_TEST_SHARED_PATTERNS=true pnpm run build
# Serve .output/public with SPA fallback and /api proxied to the backend.
HBOX_TEST_SHARED_PATTERNS=true E2E_BASE_URL=http://localhost:3001 \
  pnpm exec playwright test --config test/playwright.config.ts \
  warm-habitat-shell.browser.spec.ts --project=chromium --workers=1
```

Or from the repository root, use the existing build/start browser task:

```sh
HBOX_TEST_SHARED_PATTERNS=true task test:e2e -- warm-habitat-shell.browser.spec.ts --project=chromium --workers=1
```

Coverage includes 1440/390/320px, rendered Warm Habitat text contrast (4.5:1),
input borders/focus edges (3:1), accessible names, native label association,
keyboard menu navigation/Escape/focus restoration, active navigation underlining,
status/error text plus distinct icons, labeled keyboard-scrollable tables,
and Light/Black/Warm Habitat selection followed by saved-preference reload.
Theme saves are debounced; tests wait for the settings response before reloading.
No claim is made that every legacy theme or every application page has undergone
a complete WCAG audit. Consumers must still supply labels and explicit translated
status/destructive-action wording; brand red alone must not carry meaning.
