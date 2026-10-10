// Detail routes use singular names; match complete segments, not arbitrary prefixes.
const routeFamilies: Record<string, string[]> = {
  "/home": ["/home"],
  "/items": ["/items", "/item"],
  "/locations": ["/locations", "/location"],
  "/tags": ["/tags", "/tag"],
  "/templates": ["/templates", "/template"],
};

export function isShellRouteActive(path: string, destination: string): boolean {
  return (routeFamilies[destination] ?? [destination]).some(root => path === root || path.startsWith(`${root}/`));
}

export function inventorySearchTarget(query: string) {
  const q = query.trim();
  return { path: "/items", query: q ? { q } : {} };
}
