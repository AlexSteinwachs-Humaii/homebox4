import { test, expect, type Page } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

async function fixture(page: Page) {
  await overviewFixture(page);
  await page.addInitScript(() => {
    const key = "homebox/preferences/location";
    const prefs = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(
      key,
      JSON.stringify({ theme: "warm-habitat", language: "en", collectionId: "a", ...prefs, itemDisplayView: "table" })
    );
  });
  const state = { failed: false, pending: false, requests: [] as URL[], tenants: [] as string[] };
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

test.setTimeout(60000);
test.use({ actionTimeout: 15000 });

test("URL reload/back, real totals, pagination, direct-parent/tag filters and sort", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/items?page=2&loc=shelf&tag=tools&archived=false&orderBy=createdAt");
  await expect(page.getByText("Possession 12", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Garage / Shelf").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Purchase price / unit")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "test-results/inventory-desktop.png", fullPage: true });
  expect(state.requests.at(-1)?.searchParams.get("parentIds")).toBe("shelf");
  expect(state.requests.at(-1)?.searchParams.get("tags")).toBe("tools");
  expect(state.requests.at(-1)?.searchParams.get("includeArchived")).toBe("false");
  await page.getByRole("button", { name: "Page 3", exact: true }).last().click();
  await expect(page.getByText("Possession 24", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("nothing");
  await expect(page.getByText("No Items Found", { exact: false })).toBeVisible({ timeout: 30000 });
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.goBack();
  await expect(page.getByText("Possession 24", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(page.getByText("Possession 24", { exact: true })).toBeVisible({ timeout: 30000 });
});

test("loading, failure/retry, and collection switch clear old rows and ignore late requests", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/items");
  await expect(page.getByText("Possession 0", { exact: true })).toBeVisible({ timeout: 30000 });
  state.failed = true;
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("fail");
  await expect(page.getByRole("alert").filter({ hasText: "search" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Possession 0", { exact: true })).toHaveCount(0);
  state.failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Possession 0", { exact: true })).toBeVisible({ timeout: 30000 });
  state.pending = true;
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("pending");
  await expect(page.getByText("Loading inventory…", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Possession 0", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Select Collection: First collection", exact: true }).first().click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect.poll(() => state.tenants.includes("b")).toBe(true);
  state.pending = false;
  await expect(page.getByText("No Items Found", { exact: false })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Possession 0", { exact: true })).toHaveCount(0);
});

test("changing filters and sorting resets the page; rapid query responses cannot restore old rows", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/items?page=2");
  await expect(page.getByText("Possession 12", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Locations (direct parent)", exact: true }).click();
  await page.getByText("Shelf", { exact: true }).last().click();
  await expect.poll(() => state.requests.at(-1)?.searchParams.get("parentIds")).toBe("shelf");
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await page.getByRole("combobox").last().click();
  await page.getByRole("option", { name: "Updated At", exact: true }).click();
  await expect.poll(() => state.requests.at(-1)?.searchParams.get("orderBy")).toBe("updatedAt");
  await page.keyboard.press("Escape");
  state.pending = true;
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("old query");
  await expect.poll(() => state.requests.at(-1)?.searchParams.get("q")).toBe("old query");
  await page.getByRole("textbox", { name: "Search", exact: true }).fill("nothing");
  await expect.poll(() => state.requests.at(-1)?.searchParams.get("q")).toBe("nothing");
  state.pending = false;
  await expect(page.getByText("No Items Found", { exact: true })).toBeVisible();
  await expect(page.getByText("Possession 0", { exact: true })).toHaveCount(0);
});
