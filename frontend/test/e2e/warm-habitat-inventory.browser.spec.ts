import { test, expect as baseExpect } from "@playwright/test";
import { inventoryFixture } from "./inventory-fixture";

test.use({ actionTimeout: 15000 });
test.setTimeout(90000);
const expect = baseExpect.configure({ timeout: 30000 });

test("each record and location has its own destination; Add opens the existing form", async ({ page }) => {
  await inventoryFixture(page);
  await page.goto("/items");
  for (const id of [0, 1, 11]) {
    const row = page
      .getByRole("row")
      .filter({ hasText: `Possession ${id}` })
      .filter({ has: page.locator(`a[href='/item/tool${id}']`) })
      .first();
    const link = row.getByRole("link").filter({ hasText: `Possession ${id}` });
    await expect(link).toHaveAttribute("href", `/item/tool${id}`);
    await expect(row.getByRole("link", { name: "Garage / Shelf" })).toHaveAttribute("href", "/location/shelf");
    await link.focus();
    await expect(link).toBeFocused();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/item/tool${id}$`));
    await expect(page.getByRole("heading", { name: `Possession ${id}`, exact: true })).toBeVisible();
    await page.goBack();
  }
  await expect(page.getByText("Purchase price / unit", { exact: true })).toBeVisible();
  await expect(page.getByText("Showing 12 of 25 item records").first()).toBeVisible();
  await page.getByRole("button", { name: "Add an item", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("textbox").first()).toBeVisible();
});

test("keyboard selection, pagination and cancelled deletion never mutate records", async ({ page }) => {
  await inventoryFixture(page);
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/v1/entities") && !["GET", "HEAD"].includes(request.method())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto("/items");
  const row = page.getByRole("row").filter({ hasText: "Possession 0" });
  const checkbox = row.getByRole("checkbox", {
    name: "Select Row",
    exact: true,
  });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(page).toHaveURL(/\/items\/?$/);
  const bulkMenu = page.locator("thead").getByRole("button", { name: "Open menu" });
  await bulkMenu.click();
  await page.getByRole("menuitem", { name: "Delete Selected Items", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Are you sure you want to delete the selected items?");
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "Page 2", exact: true }).last().click();
  await expect(page.getByText("Possession 12", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select Row", exact: true }).first()).not.toBeChecked();
  await expect(bulkMenu).toBeDisabled();
  await page.goBack();
  await expect(page.getByText("Possession 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select Row", exact: true }).first()).not.toBeChecked();
  expect(mutations).toEqual([]);
});

test("mobile card location and item links are separate and selection is non-mutating", async ({ page }) => {
  await inventoryFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items");
  await page.getByRole("button", { name: "Card", exact: true }).click();
  const itemLink = page.locator("a[href='/item/tool0']");
  await expect(itemLink).toHaveCount(1);
  await expect(itemLink.locator("a[href^='/location/']")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Shelf", exact: true }).first()).toHaveAttribute(
    "href",
    "/location/shelf"
  );
  const checkbox = page.getByRole("checkbox", { name: "Select Card", exact: true }).first();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(page).toHaveURL(/\/items\/?$/);
});
