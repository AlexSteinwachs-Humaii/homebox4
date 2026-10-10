import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

// Match the existing Nuxt fixture suite's cold-start allowance.
test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
const expect = baseExpect.configure({ timeout: 30000 });

async function fixture(page: import("@playwright/test").Page) {
  await overviewFixture(page);
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/v1/entities") && request.method() !== "GET") writes.push(request.method());
  });
  await page.route("**/api/v1/entities/tree*", route =>
    route.fulfill({ json: [{ id: "office", name: "Actual office", children: [] }] })
  );
  await page.route(/\/api\/v1\/entities\?.*isLocation=true/, route =>
    route.fulfill({ json: { items: [{ id: "office", name: "Actual office" }] } })
  );
  await page.route("**/api/v1/tags", route => route.fulfill({ json: [{ id: "work", name: "Work" }] }));
  await page.route("**/api/v1/groups", route =>
    route.fulfill({ json: { id: "a", currency: "GBP", name: "First collection" } })
  );
  return writes;
}

test("routed capture uses real editable options, blank fields, currency and non-mutating cancellation", async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto("/items/new?location=office");
  await expect(page.getByRole("heading", { name: "Item information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toHaveCount(0);
  const name = page.getByLabel("Name *", { exact: false });
  await expect(name).toHaveValue("");
  await expect(page.getByLabel("Purchase price (GBP)", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox").filter({ hasText: "Actual office" })).toBeVisible();
  await name.fill("My real lamp");
  await page.getByLabel("Quantity", { exact: true }).fill("2.5");
  await page.getByLabel("Description", { exact: false }).fill("Entered description");
  await page.getByLabel("Purchased From", { exact: false }).fill("Local store");
  await page.getByLabel("Insured", { exact: true }).click();
  await page.getByPlaceholder("Select Tags").fill("Work");
  await page.getByRole("option", { name: "Work", exact: true }).click();
  await expect(page.getByText("Work", { exact: true }).first()).toBeVisible();
  await expect(name).toHaveValue("My real lamp");
  await name.click();
  await page.screenshot({ path: test.info().outputPath("capture-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  expect(writes).toEqual([]);
  await page.goto("/items/new?location=other-collection");
  await expect(page.getByRole("heading", { name: "Item information" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Parent Location", exact: true })).toContainText("Select a Location");
  await page.getByRole("link", { name: "Back to Inventory", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  expect(writes).toEqual([]);
});

test("capture field groups and cancellation fit a mobile viewport", async ({ page }) => {
  const writes = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items/new");
  await expect(page.getByRole("heading", { name: "Item information" })).toBeVisible();
  await expect(page.getByLabel("Description", { exact: false })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Entity type *", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  expect(writes).toEqual([]);
});
