import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
const expect = baseExpect.configure({ timeout: 30000 });

async function itemFixture(page: Page) {
  await overviewFixture(page);

  const location = {
    id: "garage",
    name: "Fixture garage",
    entityType: { id: "location-type", isLocation: true },
  };
  const record = {
    id: "tool",
    name: "Navigation camera",
    description: "Persisted description",
    quantity: 1,
    entityType: { id: "item-type", name: "global.item", isLocation: false },
    parent: location,
    location,
    children: [],
    tags: [],
    fields: [],
    attachments: [],
    purchasePrice: 0,
    soldPrice: 0,
    archived: false,
    insured: false,
    assetId: "123-456",
    createdAt: "2026-10-09",
    updatedAt: "2026-10-09",
  };
  const state = { record, writes: [] as string[], reads: 0, maintenanceScopes: [] as string[] };
  for (const endpoint of ["/maintenance", "/entities/tool/maintenance"]) {
    await page.route(`**/api/v1${endpoint}?*`, route => {
      state.maintenanceScopes.push(endpoint);
      return route.fulfill({ json: [] });
    });
  }
  await page.route("**/api/v1/entities/tool", async route => {
    if (route.request().headers()["x-tenant"] === "b") {
      return route.fulfill({ status: 403, json: { error: "forbidden" } });
    }
    if (route.request().method() === "PUT") {
      state.writes.push(new URL(route.request().url()).pathname);
      Object.assign(record, route.request().postDataJSON());
    } else state.reads++;
    await route.fulfill({ json: record });
  });
  await page.route("**/api/v1/entities/tool/path", route =>
    route.fulfill({
      json: [
        { id: "garage", name: "Fixture garage", type: "location" },
        { id: "box", name: "Parent toolbox", type: "item" },
        { id: "tool", name: record.name, type: "item" },
      ],
    })
  );
  return state;
}

test("Inventory, actual location and parent item links retain route identity", async ({ page }) => {
  await itemFixture(page);
  await page.goto("/items");
  await page
    .getByRole("link", { name: /Real fixture possession/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/item\/tool$/);
  await expect(page.getByRole("heading", { name: "Navigation camera", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture garage", exact: true })).toHaveAttribute(
    "href",
    "/location/garage"
  );
  await expect(page.getByRole("link", { name: "Parent toolbox", exact: true })).toHaveAttribute("href", "/item/box");
  await page.getByRole("link", { name: "Fixture garage", exact: true }).click();
  await expect(page).toHaveURL(/\/location\/garage$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Navigation camera", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to Inventory", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("collection schedule is explicit and separate from supported item maintenance and attachments", async ({
  page,
}) => {
  const state = await itemFixture(page);
  await page.goto("/item/tool");
  await expect(
    page.getByRole("link", {
      name: "Collection maintenance schedule",
      exact: true,
    })
  ).toHaveAttribute("href", "/maintenance");
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Item maintenance", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/tool\/maintenance$/);
  await expect(page.getByRole("heading", { name: "Navigation camera", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Collection maintenance schedule", exact: true }).click();
  await expect(page).toHaveURL(/\/maintenance$/);
  await expect(page.getByRole("heading", { name: "Maintenance", exact: true })).toBeVisible();
  expect(state.maintenanceScopes).toContain("/entities/tool/maintenance");
  expect(state.maintenanceScopes).toContain("/maintenance");
  await page.goBack();
  await expect(page).toHaveURL(/\/item\/tool\/maintenance$/);
});

test("Edit targets the opened entity and browser return refreshes persisted details", async ({ page }) => {
  const state = await itemFixture(page);
  await page.goto("/item/tool");
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/item/tool/edit");
  await page.getByRole("link", { name: "Edit item", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/tool\/edit$/);
  const name = page.getByRole("textbox", { name: /^Name / });
  await expect(name).toHaveValue("Navigation camera");
  await name.fill("Saved navigation camera");
  // Shift+Ctrl+S persists without leaving Edit; browser Back must refresh.
  await name.press("Control+Shift+s");
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes).toEqual(["/api/v1/entities/tool"]);
  const reads = state.reads;
  await page.goBack();
  await expect(page).toHaveURL(/\/item\/tool$/);
  await expect(page.getByRole("heading", { name: "Saved navigation camera", exact: true })).toBeVisible();
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await page.goForward();
  await expect(name).toHaveValue("Saved navigation camera");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/tool$/);
  await expect(page.getByRole("heading", { name: "Saved navigation camera", exact: true })).toBeVisible();
});

test("untrusted return query is ignored and collection switch during Edit clears the old record", async ({ page }) => {
  await itemFixture(page);
  await page.goto("/item/tool/edit?returnTo=https://example.invalid/foreign");
  await expect(page.getByRole("textbox", { name: /^Name / })).toHaveValue("Navigation camera");
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByRole("alert")).toContainText("This item is unavailable");
  await expect(page.getByRole("textbox", { name: /^Name / })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Inventory", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
});

test("following a parent item changes both detail and Edit identity, and Back restores the original", async ({
  page,
}) => {
  const state = await itemFixture(page);
  await page.route("**/api/v1/entities/box", route =>
    route.fulfill({
      json: { ...state.record, id: "box", name: "Parent toolbox", description: "Toolbox description" },
    })
  );
  await page.route("**/api/v1/entities/box/path", route =>
    route.fulfill({
      json: [
        { id: "garage", name: "Fixture garage", type: "location" },
        { id: "box", name: "Parent toolbox", type: "item" },
      ],
    })
  );
  await page.goto("/item/tool");
  await page.getByRole("link", { name: "Parent toolbox", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Parent toolbox", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/item/box/edit");
  await page.getByRole("link", { name: "Edit item", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Name / })).toHaveValue("Parent toolbox");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Parent toolbox", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Navigation camera", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "/item/tool/edit");
});
