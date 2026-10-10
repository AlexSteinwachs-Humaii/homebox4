import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/home");
  await expect(page).toHaveURL("/");
  await page.fill("input[type='text']", "demo@example.com");
  await page.fill("input[type='password']", "demodemo");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL("/home");
}

const sidebar = (page: Page) => page.locator("[data-sidebar='sidebar']");

test("task navigation, collection context, search and retained tools", async ({ page }) => {
  await login(page);
  const collection = page.getByTestId("header-collection");
  await expect(collection).not.toHaveText("Select Collection");
  const collectionName = await collection.innerText();
  await expect(sidebar(page).getByRole("combobox")).toContainText(collectionName);

  for (const [name, path] of [
    ["Overview", "/home"],
    ["Inventory", "/items"],
    ["Locations", "/locations"],
    ["Maintenance", "/maintenance"],
  ]) {
    const link = sidebar(page).getByRole("link", { name, exact: true });
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await page.waitForLoadState("networkidle");
    if (path === "/items") {
      await page.locator("main a[href^='/item/']").first().click();
      await expect(page).toHaveURL(/\/item\//);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(sidebar(page).getByRole("link", { name: "Locations", exact: true })).not.toHaveAttribute(
        "aria-current",
        "page"
      );
    }
    if (path === "/locations") {
      await page.locator("main a[href^='/location/']").first().click();
      await expect(page).toHaveURL(/\/location\//);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(sidebar(page).getByRole("link", { name: "Inventory", exact: true })).not.toHaveAttribute(
        "aria-current",
        "page"
      );
    }
  }

  const query = "drill & bits #1";
  await page.getByRole("searchbox", { name: "Search your inventory" }).fill(query);
  await page.getByRole("searchbox", { name: "Search your inventory" }).press("Enter");
  await expect(page).toHaveURL(/\/items\?/);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);

  for (const name of ["Tags", "Templates", "Profile", "Collection"]) {
    await expect(sidebar(page).getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(sidebar(page).getByRole("link", { name: "Tools", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scanner", exact: true })).toBeVisible();
  await sidebar(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Item / Asset" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Location", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Tag", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+b");
  await expect(page.locator("[data-state='collapsed'][data-collapsible='icon']")).toBeVisible();
  await page.keyboard.press("Control+b");
  await expect(sidebar(page).getByRole("combobox")).toContainText(collectionName);
  // Creating and switching collections still uses the existing full reload,
  // which clears collection-scoped stores and pending page data.
  await sidebar(page).getByRole("combobox").focus();
  await sidebar(page).getByRole("combobox").press("Enter");
  await page.getByRole("option", { name: "Create New Collection" }).click();
  const newCollection = `Shell test ${Date.now()}`;
  await page.getByRole("dialog").getByLabel("Collection Name").fill(newCollection);
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(collection).toHaveText(newCollection);
  await expect(sidebar(page).getByRole("combobox")).toContainText(newCollection);
  await page.getByRole("searchbox", { name: "Search your inventory" }).fill("");
  await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main a[href^='/item/']")).toHaveCount(0);
  await sidebar(page).getByRole("combobox").focus();
  await sidebar(page).getByRole("combobox").press("Enter");
  await page.getByRole("option", { name: collectionName, exact: true }).click();
  await expect(collection).toHaveText(collectionName);
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL("/");
  await page.goto("/items");
  await expect(page).toHaveURL("/");
});

test("small-screen sidebar keeps collection and navigation accessible after desktop collapse", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("header-collection")).toHaveText("Demo's Home");
  await page.keyboard.press("Control+b");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(sidebar(page).getByRole("combobox")).toContainText(
    await page.getByTestId("header-collection").innerText()
  );
  await sidebar(page).getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(page).toHaveURL(/\/items/);
  await expect(page.locator("[data-mobile='true']")).not.toBeVisible();
  await page.getByRole("searchbox", { name: "Search your inventory" }).fill("coffee");
  await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("coffee");
});
