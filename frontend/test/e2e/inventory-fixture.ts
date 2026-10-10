import type { Page } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

export async function inventoryFixture(page: Page) {
  await overviewFixture(page);
  await page.addInitScript(() => {
    const key = "homebox/preferences/location";
    const prefs = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(
      key,
      JSON.stringify({
        theme: "warm-habitat",
        language: "en",
        collectionId: "a",
        ...prefs,
        itemDisplayView: "table",
      })
    );
  });
  const state = {
    failed: false,
    pending: false,
    requests: [] as URL[],
    tenants: [] as string[],
  };
  await page.route("**/api/v1/entities/fields**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/entities/tree*", route =>
    route.fulfill({ json: [{ id: "shelf", name: "Shelf", children: [] }] })
  );
  await page.route("**/api/v1/tags", route => route.fulfill({ json: [{ id: "tools", name: "Tools" }] }));
  await page.route("**/api/v1/entities/tool*/path", route =>
    route.fulfill({
      json: [
        { id: "garage", name: "Garage" },
        { id: "shelf", name: "Shelf" },
      ],
    })
  );
  await page.route(/\/api\/v1\/entities\/tool\d+$/, route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return route.fulfill({
      json: {
        id,
        name: `Possession ${id.slice(4)}`,
        description: "",
        quantity: 2,
        purchasePrice: 20,
        insured: true,
        archived: false,
        tags: [],
        attachments: [],
        fields: [],
        children: [],
        parent: { id: "shelf", name: "Shelf" },
        createdAt: "2026-10-09T12:00:00Z",
        updatedAt: "2026-10-09T12:00:00Z",
      },
    });
  });
  await page.route(/\/api\/v1\/entities\?/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("isLocation")) return route.fallback();
    state.requests.push(url);
    const tenant = route.request().headers()["x-tenant"] || "";
    state.tenants.push(tenant);
    // Capture response at request time to deliberately exercise late old-query responses.
    const q = url.searchParams.get("q");
    const empty = q === "nothing" || tenant === "b";
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const failed = state.failed;
    while (state.pending) await new Promise(resolve => setTimeout(resolve, 10));
    if (failed) return route.fulfill({ status: 500, json: { error: "fixture failure" } });
    await route.fulfill({
      json: {
        total: empty ? 0 : 25,
        items: empty
          ? []
          : Array.from({ length: pageNumber === 3 ? 1 : 12 }, (_, i) => ({
              id: `tool${(pageNumber - 1) * 12 + i}`,
              name: `Possession ${(pageNumber - 1) * 12 + i}`,
              assetId: `000-${i}`,
              quantity: 2,
              insured: true,
              purchasePrice: 20,
              tags: [{ id: "tools", name: "Tools" }],
              parent: { id: "shelf", name: "Shelf" },
              archived: false,
              createdAt: "2026-10-09",
              updatedAt: "2026-10-09",
            })),
      },
    });
  });
  return state;
}
