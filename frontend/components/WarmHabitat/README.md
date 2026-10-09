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

This story deliberately does not adapt authenticated navigation or restyle the
nine routes; those are subsequent shell/screen stories.
