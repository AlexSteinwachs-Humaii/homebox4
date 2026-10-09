import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`retains lifecycle history and supports discovery at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const email = `lifecycle-${width}-${Date.now()}@example.com`;
    const password = "Lifecycle-Test-Password-123!";
    const registration = await page.request.post("/api/v1/users/register", {
      data: { email, password, name: "Lifecycle Test" },
    });
    expect(registration.status()).toBe(204);
    await page.goto("/");
    await page.locator("input[type=text]").fill(email);
    await page.locator("input[type=password]").fill(password);
    const login = page.waitForResponse("**/api/v1/users/login");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    const { token } = await (await login).json();
    await expect(page).toHaveURL("/home");
    const name = `Lifecycle asset ${width}`;
    const created = await page.request.post("/api/v1/entities", {
      headers: { Authorization: token },
      data: { name, description: "", quantity: 1, tagIds: [], parentId: null },
    });
    expect(created.status()).toBe(201);
    const item = await created.json();
    await page.goto(`/item/${item.id}`);
    const openAction = async (action: string) => {
      await page.getByRole("button", { name: "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: action, exact: true }).click();
    };
    await openAction("Offboard");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Outcome")).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await openAction("Offboard");
    await dialog.getByLabel("Outcome").selectOption("custom");
    await dialog.getByRole("button", { name: "Offboard", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a custom reason.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Offboarding history", { exact: true })).toHaveCount(0);

    for (const [index, outcome] of ["sold", "donated", "disposed", "recycled", "lost", "custom"].entries()) {
      await openAction("Offboard");
      await dialog.getByLabel("Outcome").selectOption(outcome);
      await dialog.getByLabel("Offboarding date (required)").fill("2026-10-09");
      await dialog.getByLabel("Notes (optional)").fill(`Cycle ${index + 1} notes`);
      if (outcome === "custom") await dialog.getByLabel("Custom reason (required)").fill("Returned to supplier");
      if (index === 0) {
        await page.route("**/api/v1/entities/*/offboard", route =>
          route.fulfill({ status: 409, json: { error: "Conflict" } })
        );
        await dialog.getByRole("button", { name: "Offboard", exact: true }).click();
        await expect(dialog.getByRole("alert")).toContainText("Unable to save");
        await expect(dialog.getByLabel("Notes (optional)")).toHaveValue("Cycle 1 notes");
        await expect(page.getByText("Offboarding history", { exact: true })).toHaveCount(0);
        await page.unroute("**/api/v1/entities/*/offboard");
      }
      await dialog.getByRole("button", { name: "Offboard", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveText("Offboarded");
      for (let cycle = 1; cycle <= index + 1; cycle++)
        await expect(page.getByText(`Cycle ${cycle} notes`, { exact: true })).toBeVisible();
      if (index === 5) {
        await expect(page.getByText("Returned to supplier", { exact: true })).toBeVisible();
        await expect(page.getByText("2026-10-09", { exact: false }).first()).toBeVisible();
      }
      await page.reload();
      await expect(page.getByRole("status")).toHaveText("Offboarded");
      if (index === 0) {
        await page.goto(`/items?q=${encodeURIComponent(name)}`);
        await expect(page.getByLabel("Lifecycle", { exact: true })).toHaveValue("active");
        await expect(page.locator(`a[href='/item/${item.id}']`)).toHaveCount(0);
        await page.getByLabel("Lifecycle", { exact: true }).selectOption("offboarded");
        await page.getByRole("heading", { name, exact: true }).click();
        await expect(page).toHaveURL(`/item/${item.id}`);
      }
      await openAction("Reactivate");
      await dialog.getByRole("button", { name: "Reactivate", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveText("Active");
      await expect(page.getByText("Cycle 1 notes", { exact: true })).toBeVisible();
    }
    await page.goto("/home");
    const recent = page.locator("section").filter({ hasText: "Recently Added" });
    await expect(recent).toContainText(name);
    await page.goto(`/items?q=${encodeURIComponent(name)}`);
    await expect(page.locator(`a[href='/item/${item.id}']`).first()).toBeVisible();
    await page.getByLabel("Lifecycle", { exact: true }).selectOption("offboarded");
    await expect(page.locator(`a[href='/item/${item.id}']`)).toHaveCount(0);
    await page.request.delete(`/api/v1/entities/${item.id}`, { headers: { Authorization: token } });
  });
}
