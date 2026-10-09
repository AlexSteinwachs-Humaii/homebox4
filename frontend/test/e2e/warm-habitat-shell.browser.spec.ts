import { expect, test, type Locator, type Page } from "@playwright/test";

// The representative-pattern route is intentionally absent from normal builds.
// Enable the flag for both Nuxt and Playwright (see WarmHabitat/README.md).
test.skip(process.env.HBOX_TEST_SHARED_PATTERNS !== "true", "Requires the opt-in shared-pattern fixture build");

async function login(page: Page) {
  await page.goto("/home");
  await expect(page).toHaveURL("/");
  await page.fill("input[type='text']", "demo@example.com");
  await page.fill("input[type='password']", "demodemo");
  await page.click("button[type='submit']");
  await expect(page).toHaveURL("/home");
  await page.goto("/__test/shared-patterns");
  await expect(page.getByRole("heading", { name: "Shared accessibility fixture" })).toBeVisible();
}

async function keyboardFocus(control: Locator) {
  await control.focus();
  await control.press("Tab");
  await control.page().keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  expect(
    await control.evaluate(el => {
      const style = getComputedStyle(el);
      return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none";
    })
  ).toBe(true);
}

// Measure rendered foreground/background rather than approximating hex tokens.
async function contrast(control: Locator, property = "color") {
  return control.evaluate((el, property) => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (channels: number[]) =>
      channels
        .slice(0, 3)
        .map(v => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let ancestor: Element | null = el;
    let background = [255, 255, 255];
    while (ancestor) {
      const parsed = rgb(getComputedStyle(ancestor).backgroundColor);
      if (parsed.length === 3 || parsed[3] === 1) {
        background = parsed;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    const foreground = luminance(rgb(getComputedStyle(el).getPropertyValue(property)));
    const back = luminance(background);
    return (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05);
  }, property);
}

for (const width of [1440, 390, 320]) {
  test(`shared patterns, keyboard menus and themes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const picker = page.getByRole("button", {
      name: "Warm Habitat",
      exact: true,
    });
    await picker.focus();
    await picker.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "warm-habitat");
    await expect(picker).toHaveAttribute("aria-pressed", "true");

    const input = page.getByRole("textbox", {
      name: "Example name",
      exact: true,
    });
    const search = page.getByRole("searchbox", {
      name: "Search your inventory",
    });
    const save = page.getByRole("link", { name: "Save example" });
    const help = page.getByRole("button", { name: "Help with example" });
    const edit = page.getByRole("link", { name: "Edit example" });
    const destructive = page.getByRole("button", { name: "Delete example" });
    for (const control of [input, search, save, help, edit, destructive]) {
      await keyboardFocus(control);
      expect(await contrast(control)).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(control, "outline-color")).toBeGreaterThanOrEqual(3);
    }
    expect(await contrast(input, "border-top-color")).toBeGreaterThanOrEqual(3);
    for (const text of [
      page.locator(".habitat-feedback .text-muted-foreground").first(),
      page.getByRole("columnheader").first(),
    ]) {
      expect(await contrast(text)).toBeGreaterThanOrEqual(4.5);
    }
    await expect(page.getByRole("status").filter({ hasText: "Example saved" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Example could not be saved" })).toBeVisible();
    await expect(page.locator(".habitat-feedback svg")).toHaveCount(2);
    const table = page.getByRole("region", { name: "Example inventory" });
    await keyboardFocus(table);
    if (width < 500) {
      expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await table.press("ArrowRight");
      await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of [search, page.getByRole("button", { name: "Scanner", exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }

    // Real shell menus, including portalled small-screen sidebar and popover.
    if (width < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const sidebar = page.locator("[data-sidebar='sidebar']");
    const collection = sidebar.getByRole("combobox");
    await keyboardFocus(collection);
    await collection.press("Enter");
    const collectionSearch = page.getByRole("combobox", {
      name: "Search collections",
    });
    await expect(collectionSearch).toBeVisible();
    await keyboardFocus(collectionSearch);
    await collectionSearch.fill("Demo");
    await collectionSearch.press("Escape");
    await expect(collection).toBeFocused();
    const create = sidebar.getByRole("button", { name: "Create", exact: true });
    await create.focus();
    await create.press("Enter");
    const menuItem = page.getByRole("menuitem", { name: "Item / Asset" });
    await expect(menuItem).toBeVisible();
    expect(await contrast(menuItem)).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Location", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(create).toBeFocused();
    const overview = sidebar.getByRole("link", {
      name: "Overview",
      exact: true,
    });
    await overview.focus();
    await overview.press("Enter");
    await expect(page).toHaveURL("/home");
    if (width < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(overview).toHaveAttribute("aria-current", "page");
    expect(await overview.evaluate(el => getComputedStyle(el).textDecorationLine)).toContain("underline");
    expect(await contrast(overview)).toBeGreaterThanOrEqual(4.5);
    await keyboardFocus(overview);
    await page.keyboard.press("Escape");

    // Switch through existing themes with real buttons and persist across reload.
    await page.goto("/__test/shared-patterns");
    for (const theme of ["Light", "Black", "Warm Habitat"]) {
      const option = page.getByRole("button", { name: theme, exact: true });
      await option.focus();
      const saved = page.waitForResponse(
        response =>
          response.url().endsWith("/users/self/settings") &&
          response.request().method() === "PUT" &&
          response.request().postDataJSON()?.theme === theme.toLowerCase().replace(" ", "-") &&
          response.ok()
      );
      await option.press("Space");
      await expect(option).toHaveAttribute("aria-pressed", "true");
      await saved;
      await page.reload();
      await expect(option).toHaveAttribute("aria-pressed", "true");
      await expect(input).toBeVisible();
      await keyboardFocus(input);
      await expect(save).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
