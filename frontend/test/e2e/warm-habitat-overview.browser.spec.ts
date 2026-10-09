import { expect, test } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

const destinations = [
  { name: "Item records", path: "/items" },
  { name: "Recorded purchase value", path: "/items" },
  { name: "Total Locations", path: "/locations", statistics: true },
  { name: "View inventory →", path: "/items" },
  { name: "Real fixture possession", path: "/item/tool", partial: true },
  { name: "Fixture garage: No photo", path: "/location/garage", partial: true },
];

for (const destination of destinations) {
  test(`Overview navigates ${destination.name} to its supported destination`, async ({ page }) => {
    await overviewFixture(page);
    await page.goto("/home");
    const surface = destination.statistics ? page.getByRole("region", { name: "Quick Statistics" }) : page;
    const link = surface.getByRole("link", {
      name: destination.name,
      exact: !destination.partial,
    });
    await expect(link).toHaveAttribute("href", destination.path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
  });
}

test("View all links reach Inventory and Locations; tags remain a count, not a new workflow", async ({ page }) => {
  await overviewFixture(page);
  await page.goto("/home");
  const viewAll = page.getByRole("link", { name: "View all →", exact: true });
  await expect(viewAll).toHaveCount(2);
  await expect(viewAll.nth(0)).toHaveAttribute("href", "/items");
  await expect(viewAll.nth(1)).toHaveAttribute("href", "/locations");
  const statistics = page.getByRole("region", { name: "Quick Statistics" });
  await expect(statistics.getByRole("heading", { name: "Tags", exact: true })).toBeVisible();
  await expect(statistics.getByRole("link", { name: "Tags", exact: true })).toHaveCount(0);
  await viewAll.nth(0).click();
  await expect(page).toHaveURL(/\/items$/);
  await page.goBack();
  // A static-host history return may reload the document; wait for hydrated data before clicking.
  await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
  await viewAll.nth(1).click();
  await expect(page).toHaveURL(/\/locations$/);
});

test("both Add item entry points and Create location retain the existing dialogs", async ({ page }) => {
  await overviewFixture(page);
  await page.goto("/home");
  const add = page.getByRole("button", { name: "Add an item", exact: true });
  await expect(add).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await add.nth(index).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Item", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Create a location", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Location", { exact: true }).first()).toBeVisible();
});

test("returning after an off-page mutation reloads the same collection without resetting records", async ({ page }) => {
  const state = await overviewFixture(page);
  await page.goto("/home");
  await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View inventory →", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  const before = state.tenantRequests.length;
  // The event can arrive while Overview is unmounted, e.g. after saving in another page.
  state.updated = true;
  state.mutation();
  await page.goBack();
  await expect(page.getByText("$120.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Updated fixture possession", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture garage: No photo", exact: false })).toHaveAttribute(
    "href",
    "/location/garage"
  );
  expect(state.tenantRequests.slice(before).filter(tenant => tenant === "a").length).toBeGreaterThanOrEqual(3);
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!));
  expect(preferences.collectionId).toBe("a");
});

test("Overview scanner buttons open the existing scanner, without requiring a camera", async ({ page }) => {
  await overviewFixture(page);
  await page.goto("/home");
  // Includes the shared shell's scanner: all three reuse the same dialog.
  const scanners = page.getByRole("button", { name: "Scanner", exact: true });
  await expect(scanners).toHaveCount(3);
  for (let index = 1; index < 3; index++) {
    await scanners.nth(index).click();
    await expect(page.getByRole("dialog").locator("video")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
