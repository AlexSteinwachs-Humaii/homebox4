import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.setTimeout(90000);
const expect = baseExpect.configure({ timeout: 30000 });

async function fixture(page: import("@playwright/test").Page, nested = true) {
  const events = await overviewFixture(page);
  const location = {
    id: "garage",
    name: "Actual garage",
    entityType: { id: "location-type", isLocation: true },
  };
  const record = {
    id: "record",
    name: "Recorded camera",
    description: "My camera description",
    quantity: 2.5,
    assetId: "123-456",
    manufacturer: "Actual maker",
    modelNumber: "CAM-X",
    serialNumber: "REAL-99",
    insured: true,
    archived: true,
    notes: "Keep me",
    fields: [{ id: "field", name: "Lens", textValue: "35mm", type: "text" }],
    tags: [{ id: "camera-tag", name: "Cameras" }],
    children: [],
    attachments: [],
    entityType: { id: "item-type", name: "global.item", isLocation: false },
    parent: nested
      ? {
          id: "case",
          name: "Actual camera case",
          entityType: { id: "item-type", isLocation: false },
        }
      : location,
    location,
    syncChildEntityLocations: false,
    purchaseFrom: "Camera shop",
    purchasePrice: 42.5,
    purchaseDate: "2026-02-03",
    soldPrice: 0,
    soldTo: "",
    soldDate: "",
    lifetimeWarranty: false,
    warrantyExpires: "",
    warrantyDetails: "Real warranty",
    createdAt: "2026-10-09",
    updatedAt: "2026-10-09",
  };
  const writes: string[] = [];
  await page.route("**/api/v1/entities/record", async route => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    if (route.request().headers()["x-tenant"] === "b")
      return route.fulfill({ status: 403, json: { error: "forbidden" } });
    await route.fulfill({ json: record });
  });
  await page.route("**/api/v1/entities/tree*", route => route.fulfill({ json: [location] }));
  await page.route("**/api/v1/tags", route => route.fulfill({ json: record.tags }));
  return { events, record, writes };
}

test("edit loads actual grouped values, nested parent and immutable purchase context", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/item/record/edit");
  await expect(page.getByRole("heading", { name: "Edit Recorded camera" })).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Recorded camera");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2.5");
  for (const [label, value] of [
    ["Manufacturer", "Actual maker"],
    ["Model Number", "CAM-X"],
    ["Serial Number", "REAL-99"],
  ]) {
    await expect(page.getByLabel(label!, { exact: false })).toHaveValue(value!);
  }
  await expect(page.getByRole("combobox", { name: "Parent Location", exact: true })).toContainText("Actual garage");
  await expect(page.getByRole("combobox", { name: "Parent Item", exact: true })).toContainText("Actual camera case");
  await expect(page.locator("span").getByText("Cameras", { exact: true })).toBeVisible();
  const context = page.getByRole("complementary", { name: "Purchase context" });
  await expect(context).toContainText("$42.50");
  await expect(context).toContainText("February 3rd, 2026");
  await expect(context.locator("dl > div").filter({ hasText: "Archived" }).locator("dd")).toHaveText("Yes");
  await page.getByLabel("Name *", { exact: false }).fill("Unsaved camera");
  state.record.name = "External refresh";
  state.events.mutation();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Unsaved camera");
  await expect(context).toContainText("Recorded camera");
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByText("Custom Fields", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Purchased From", { exact: false })).toHaveValue("Camera shop");
  await expect(
    page.getByRole("heading", { name: "Warranty Details", exact: true }).locator("../..").getByRole("textbox").last()
  ).toHaveValue("Real warranty");
  await expect(page.getByRole("textbox", { name: /^Value/ })).toHaveValue("35mm");
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("direct location and mobile layout retain real values", async ({ page }) => {
  await fixture(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/item/record/edit");
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Recorded camera");
  await expect(page.getByRole("combobox", { name: "Parent Location", exact: true })).toContainText("Actual garage");
  await expect(page.getByRole("combobox", { name: "Parent Item", exact: true })).not.toContainText(
    "Actual camera case"
  );
  await expect(page.getByRole("complementary", { name: "Purchase context" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("changing collection discards the previous draft before forbidden response", async ({ page }) => {
  await fixture(page);
  await page.goto("/item/record/edit");
  await expect(page.getByLabel("Name *", { exact: false })).toBeVisible();
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveCount(0);
  await expect(page.getByText("This item is unavailable or you do not have access to it.")).toBeVisible();
  await expect(page.getByText("Recorded camera", { exact: true })).toHaveCount(0);
});
