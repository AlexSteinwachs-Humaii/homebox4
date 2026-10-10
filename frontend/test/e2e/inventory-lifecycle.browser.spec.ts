import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`inventory discovery keeps the latest lifecycle results at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const name = `Discovery ${Date.now()}`;
    const email = `discovery-${Date.now()}@example.com`;
    const password = "Discovery-Test-Password-123!";
    const registration = await page.request.post("/api/v1/users/register", {
      data: { email, password, name: "Discovery Test" },
    });
    expect(registration.status()).toBe(204);
    await page.goto("/");
    await page.locator("input[type=text]").fill(email);
    await page.locator("input[type=password]").fill(password);
    const login = page.waitForResponse("**/api/v1/users/login");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    const { token } = await (await login).json();
    await expect(page).toHaveURL("/home");
    const headers = { Authorization: token };
    const create = async (suffix: string) => {
      const response = await page.request.post("/api/v1/entities", {
        headers,
        data: { name: `${name} ${suffix}`, description: "", quantity: 1, tagIds: [], parentId: null },
      });
      expect(response.status()).toBe(201);
      return response.json();
    };
    const active = await create("active");
    const retired = await create("retired");
    const legacy = await create("legacy archived");
    const legacyDetail = await (await page.request.get(`/api/v1/entities/${legacy.id}`, { headers })).json();
    expect(
      (
        await page.request.put(`/api/v1/entities/${legacy.id}`, {
          headers,
          data: {
            ...legacyDetail,
            archived: true,
            parentId: null,
            entityTypeId: legacyDetail.entityType.id,
            tagIds: [],
          },
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post(`/api/v1/entities/${retired.id}/offboard`, {
          headers,
          data: { outcome: "recycled", effectiveDate: "2026-10-09", notes: "Retained for discovery" },
        })
      ).status()
    ).toBe(201);

    await page.goto(`/items?q=${encodeURIComponent(name)}`);
    const filter = page.getByLabel("Lifecycle", { exact: true });
    const link = (id: string) => page.locator(`a[href='/item/${id}']`).first();
    await expect(filter).toHaveValue("active");
    await expect(link(active.id)).toBeVisible();
    await expect(link(retired.id)).toHaveCount(0);
    await expect(link(legacy.id)).toHaveCount(0);
    await expect(page.getByText(/^1 Results Page/)).toBeVisible();

    // Hold an inclusive search until the subsequent offboarded search completes.
    // Without request ordering, this older response replaces both cards and totals.
    let release = () => {};
    let started = () => {};
    const pending = new Promise<void>(resolve => {
      started = resolve;
    });
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route("**/api/v1/entities?*", async route => {
      if (new URL(route.request().url()).searchParams.get("lifecycle") !== "all") return route.continue();
      const response = await route.fetch();
      started();
      await held;
      await route.fulfill({ response });
    });
    await filter.selectOption("all");
    await pending;
    await filter.selectOption("offboarded");
    await expect(link(retired.id)).toBeVisible();
    await expect(link(active.id)).toHaveCount(0);
    const oldResponse = page.waitForResponse(
      response => new URL(response.url()).searchParams.get("lifecycle") === "all"
    );
    release();
    await oldResponse;
    // Wait for fetch completion and the browser's next render, not a new search
    // that could conceal a stale-response regression.
    await page.waitForLoadState("networkidle");
    await expect(filter).toHaveValue("offboarded");
    await expect(link(active.id)).toHaveCount(0);
    await expect(page.getByText(/^1 Results Page/)).toBeVisible();
    await page.unroute("**/api/v1/entities?*");
    await link(retired.id).click();
    await expect(page).toHaveURL(`/item/${retired.id}`);
    await expect(page.getByRole("status")).toHaveText("Offboarded");
    await expect(page.getByText("Retained for discovery", { exact: true })).toBeVisible();

    expect((await page.request.post(`/api/v1/entities/${retired.id}/reactivate`, { headers })).status()).toBe(204);
    // A last page can become empty after lifecycle mutations. Recover the page
    // without losing the server's count for the selected filter.
    await page.goto(`/items?q=${encodeURIComponent(name)}&page=2`);
    await expect(link(retired.id)).toBeVisible();
    await expect(page.getByText(/^2 Results Page 1 of 1/)).toBeVisible();
    await filter.selectOption("offboarded");
    await expect(link(retired.id)).toHaveCount(0);
    await filter.selectOption("all");
    await expect(page.getByText(/^2 Results Page/)).toBeVisible();
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page.getByRole("switch").first().click();
    await page.keyboard.press("Escape");
    await expect(link(legacy.id)).toBeVisible();
    await expect(page.getByText(/^3 Results Page/)).toBeVisible();
    await link(legacy.id).click();
    await expect(page.getByText("Offboarding history", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Offboarded" })).toHaveCount(0);
    for (const item of [active, retired, legacy]) {
      expect((await page.request.delete(`/api/v1/entities/${item.id}`, { headers })).status()).toBe(204);
    }
  });
}
