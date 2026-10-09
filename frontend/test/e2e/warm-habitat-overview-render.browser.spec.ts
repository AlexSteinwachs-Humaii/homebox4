import { expect, test, type Page } from "@playwright/test";

// Presentation/data-lifecycle tests use explicit API fixtures, never production seed records.
async function fixture(page: Page) {
  const state = {
    failed: false,
    empty: false,
    tenantRequests: [] as string[],
    pending: false,
    updated: false,
    photo: false,
    brokenPhoto: false,
    mutation: () => {},
  };
  await page.routeWebSocket("**/api/v1/ws/events*", socket => {
    state.mutation = () => socket.send(JSON.stringify({ event: "entity.mutation" }));
  });
  await page.context().addCookies([
    { name: "hb.auth.session", value: "true", url: process.env.E2E_BASE_URL || "http://localhost:3000" },
    {
      name: "hb.auth.attachment_token",
      value: "fixture-token",
      url: process.env.E2E_BASE_URL || "http://localhost:3000",
    },
  ]);
  await page.addInitScript(() => {
    if (!localStorage.getItem("homebox/preferences/location")) {
      localStorage.setItem(
        "homebox/preferences/location",
        JSON.stringify({ theme: "warm-habitat", language: "en", collectionId: "a" })
      );
    }
  });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const tenant = route.request().headers()["x-tenant"] || "a";
    const dataRequest = path === "/groups/statistics" || path === "/entities";
    if (dataRequest) state.tenantRequests.push(tenant);
    if (state.pending && dataRequest) {
      await new Promise<void>(resolve => {
        const timer = setInterval(() => {
          if (!state.pending) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
    }
    if (state.failed && dataRequest) return route.fulfill({ status: 500, json: { error: "fixture failure" } });
    if (path === "/entities/tool/attachments/thumb") {
      if (state.brokenPhoto) return route.fulfill({ status: 404 });
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="gray"/></svg>',
      });
    }
    const item = {
      id: "tool",
      name: state.updated ? "Updated fixture possession" : "Real fixture possession",
      quantity: 3,
      thumbnailId: state.photo ? "thumb" : null,
      imageId: state.photo ? "original" : null,
      purchasePrice: 20,
      createdAt: "2026-10-09T12:00:00Z",
      parent: { id: "shelf", name: "Shelf" },
      tags: [],
      archived: false,
    };
    let data: unknown = {};
    if (path === "/users/self")
      data = { item: { id: "user", name: "Household tester", email: "fixture@example.invalid", defaultGroupId: "a" } };
    else if (path === "/users/self/settings") data = {};
    else if (path === "/groups/all")
      data = [
        { id: "a", name: "First collection", currency: "USD" },
        { id: "b", name: "Second collection", currency: "EUR" },
      ];
    else if (path === "/groups")
      data = {
        id: tenant,
        name: tenant === "a" ? "First collection" : "Second collection",
        currency: tenant === "a" ? "USD" : "EUR",
      };
    else if (path === "/groups/statistics")
      data = {
        totalItems: state.empty || tenant === "b" ? 0 : 1,
        totalItemPrice: state.empty || tenant === "b" ? 0 : state.updated ? 120 : 60,
        totalLocations: state.empty || tenant === "b" ? 0 : 1,
        totalTags: 0,
      };
    else if (path === "/entities")
      data = {
        items:
          state.empty || tenant === "b"
            ? []
            : url.searchParams.get("isLocation") === "true"
              ? [{ ...item, id: "garage", name: "Fixture garage" }]
              : [item],
        total: 1,
        page: 1,
        pageSize: 5,
      };
    else if (path === "/entities/tool/path")
      data = [
        { id: "garage", name: "Fixture garage" },
        { id: "shelf", name: "Shelf" },
        { id: "tool", name: item.name },
      ];
    else if (path === "/groups/currencies") data = [];
    else if (path === "/status")
      data = {
        allowRegistration: true,
        build: { version: "v1.0.0", commit: "fixture" },
        latest: { version: "v1.0.0" },
      };
    else if (path === "/entities/tree" || path === "/tags" || path === "/entity-types") data = [];
    await route.fulfill({ json: data });
  });
  return state;
}

for (const width of [1440, 390]) {
  test(`overview hierarchy and real record context at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Item records", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recorded purchase value" })).toBeVisible();
    await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Real fixture possession", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture garage / Shelf", { exact: true })).toBeVisible();
    await expect(page.getByText("Quantity 3", { exact: true })).toBeVisible();
    await expect(page.locator("time")).toHaveText("10/09/2026");
    await expect(page.getByRole("img", { name: "Real fixture possession: No photo available" })).toBeVisible();
    for (const title of ["Recently Added", "Quick actions", "Browse locations", "Make room for your next find."]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`overview-${width}.png`), fullPage: true });
  });
}

test("pending, failures/retry, empty totals and switching collection are distinct", async ({ page }) => {
  const state = await fixture(page);
  state.pending = true;
  await page.goto("/home");
  await expect(page.getByText("Loading").first()).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
  state.failed = true;
  state.pending = false;
  await expect(page.getByRole("heading", { name: "Could not load collection statistics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load recent possessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load locations" })).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Real fixture possession", { exact: true })).toHaveCount(0);
  state.failed = false;
  state.empty = true;
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(page.getByText("$0.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load recent possessions" })).toHaveCount(0);
  // Change the actual preferences ref through the real collection picker; verify X-Tenant is refreshed.
  await page.getByRole("combobox", { name: "Select Collection: First collection", exact: true }).click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByText("€0.00", { exact: true })).toBeVisible();
  expect(state.tenantRequests.filter(tenant => tenant === "b").length).toBeGreaterThanOrEqual(3);
});

test("entity mutations refresh totals, recent possessions and locations", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/home");
  await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Real fixture possession", { exact: true })).toBeVisible();
  const before = state.tenantRequests.length;
  state.updated = true;
  state.mutation();
  await expect(page.getByText("$120.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Updated fixture possession", { exact: true })).toBeVisible();
  expect(state.tenantRequests.length).toBeGreaterThanOrEqual(before + 3);
});

test("uses the real authenticated thumbnail URL and labels missing or failed photos", async ({ page }) => {
  const state = await fixture(page);
  state.photo = true;
  await page.goto("/home");
  const photo = page.locator("img[alt='Real fixture possession']");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("src", /\/entities\/tool\/attachments\/thumb/);
  expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(48);
  state.brokenPhoto = true;
  await page.reload();
  await expect(page.getByRole("img", { name: "Real fixture possession: No photo available" })).toBeVisible();
});
