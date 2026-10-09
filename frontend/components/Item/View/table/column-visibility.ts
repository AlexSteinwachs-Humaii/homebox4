import type { VisibilityState } from "@tanstack/vue-table";

/** Apply surface-specific visibility without modifying saved inventory preferences. */
export function requireVisibleColumns(visibility: VisibilityState, required: string[] = []): VisibilityState {
  return { ...visibility, ...Object.fromEntries(required.map(id => [id, true])) };
}
