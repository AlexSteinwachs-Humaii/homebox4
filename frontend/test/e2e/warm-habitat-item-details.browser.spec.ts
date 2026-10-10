import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
const expect = baseExpect.configure({ timeout: 30000 });

async function fixture(page: import("@playwright/test").Page) {
  await overviewFixture(page);
  const state = { photo: false, broken: false, pending: false, completed: 0, tenants: [] as string[] };
  await page.route("**/api/v1/entities/record/path", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/entities/record/attachments/**", route =>
    route.fulfill(
      state.broken
        ? { status: 404 }
        : {
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="gray"/></svg>',
          }
    )
  );
  await page.route("**/api/v1/entities/record", async route => {
    const tenant = route.request().headers()["x-tenant"];
    state.tenants.push(tenant);
    while (state.pending && tenant === "a") await new Promise(resolve => setTimeout(resolve, 10));
    if (tenant === "b") return route.fulfill({ status: 403, json: { error: "forbidden" } });
    await route.fulfill({
      json: {
        id: "record",
        name: "Recorded camera",
        description: "Actual camera description",
        quantity: 0,
        assetId: "123-456",
        manufacturer: "Camera maker",
        modelNumber: "CAM-X",
        serialNumber: "REAL-99",
        insured: false,
        archived: true,
        notes: "",
        fields: [],
        tags: [{ id: "camera-tag", name: "Cameras" }],
        children: [],
        purchaseFrom: "Camera shop",
        purchasePrice: 42.5,
        purchaseDate: "2026-02-03",
        createdAt: "2026-10-09",
        updatedAt: "2026-10-09",
        soldPrice: 0,
        soldTo: "",
        soldDate: "",
        lifetimeWarranty: false,
        warrantyExpires: "",
        warrantyDetails: "",
        attachments: state.photo
          ? [{ id: "photo", type: "photo", mimeType: "image/svg+xml", thumbnail: { id: "thumb" } }]
          : [],
      },
    });
    state.completed++;
  });
  return state;
}

test("actual recorded fields and labeled missing photo render in reusable detail panels", async ({ page }) => {
  await fixture(page);
  await page.goto("/item/record");
  await expect(page.getByRole("heading", { name: "Recorded camera", exact: true })).toBeVisible();
  await expect(page.getByText("No photo available", { exact: true })).toBeVisible();
  await expect(page.getByText("Actual camera description")).toBeVisible();
  await expect(page.getByText("Cameras", { exact: true })).toBeVisible();
  for (const text of ["Camera maker", "CAM-X", "REAL-99", "123-456", "Camera shop", "$42.50"]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  const rows = page.locator("dl > div");
  await expect(rows.filter({ hasText: "Quantity" }).locator("dd")).toContainText("0");
  await expect(rows.filter({ hasText: "Insured" }).locator("dd")).toHaveText("No");
  await expect(rows.filter({ hasText: "Archived" }).locator("dd")).toHaveText("Yes");
});

test("photos use authorized URLs and broken photos show a labeled fallback", async ({ page }) => {
  const state = await fixture(page);
  state.photo = true;
  await page.goto("/item/record");
  const image = page.getByRole("img", { name: "Recorded camera", exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /\/entities\/record\/attachments\/thumb.*fixture-token/);
  state.broken = true;
  await page.reload();
  await expect(page.getByText("No photo available", { exact: true })).toBeVisible();
});

test("collection switch clears previous record and late success cannot replace forbidden state", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/item/record");
  await expect(page.getByRole("heading", { name: "Recorded camera", exact: true })).toBeVisible();
  state.pending = true;
  // Hold an old-collection success in flight while switching tenants.
  await page.reload();
  await expect.poll(() => state.tenants.filter(tenant => tenant === "a").length).toBeGreaterThan(1);
  await page.getByRole("combobox", { name: "Select Collection: First collection", exact: true }).first().click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect.poll(() => state.tenants.includes("b")).toBe(true);
  await expect(page.getByRole("alert")).toContainText("This item is unavailable");
  await expect(page.getByText("Camera maker", { exact: true })).toHaveCount(0);
  // The collection selector reloads the document, so the old request may be cancelled.
  state.pending = false;
  await expect.poll(() => state.completed).toBeGreaterThan(1);
  await expect(page.getByRole("alert")).toContainText("This item is unavailable");
  await expect(page.getByRole("heading", { name: "Recorded camera", exact: true })).toHaveCount(0);
});

for (const status of [403, 404]) {
  test(`direct unavailable item (${status}) has no seeded or prior details`, async ({ page }) => {
    await fixture(page);
    await page.route("**/api/v1/entities/record", route => route.fulfill({ status, json: { error: "unavailable" } }));
    await page.goto("/item/record");
    await expect(page.getByRole("alert")).toContainText("This item is unavailable");
    await expect(page.getByRole("heading", { name: "Recorded camera", exact: true })).toHaveCount(0);
    await expect(page.getByText("Camera shop", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  });
}
