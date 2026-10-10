import { expect, test } from "@playwright/test";
import type { EntitySummary } from "../../lib/api/types/data-contracts";

const preferenceKey = "homebox/preferences/location";
const headerCases = [
  { name: "default headers", headers: undefined },
  { name: "saved headers missing Asset ID", headers: [{ value: "name", enabled: true }] },
  {
    name: "saved headers hiding Asset ID",
    headers: [
      { value: "name", enabled: true },
      { value: "assetId", enabled: false },
    ],
  },
];

for (const scenario of headerCases) {
  test(`Recently Added restores Asset ID with ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      ({ key, headers }) => {
        localStorage.setItem(key, JSON.stringify({ tableHeaders: headers, language: "en" }));
      },
      { key: preferenceKey, headers: scenario.headers }
    );
    await page.goto("/home");
    await expect(page).toHaveURL("/");
    await page.fill("input[type='text']", "demo@example.com");
    await page.fill("input[type='password']", "demodemo");
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/entities") && url.searchParams.get("orderBy") === "createdAt";
    });
    await page.click("button[type='submit']");
    const response = await responsePromise;
    expect(new URL(response.url()).searchParams.get("pageSize")).toBe("5");
    const { items } = (await response.json()) as { items: EntitySummary[] };
    expect(items.length).toBeGreaterThan(0);
    const section = page.locator("section").filter({ hasText: "Recently Added" });
    await expect(section.getByRole("columnheader", { name: "Asset ID" })).toBeVisible();
    for (const [index, item] of items.entries()) {
      const row = section.locator("tbody tr").nth(index);
      await expect(row.getByRole("cell", { name: item.assetId, exact: true })).toBeVisible();
      await expect(row).toContainText(item.name);
    }
    expect(
      await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}").tableHeaders, preferenceKey)
    ).toEqual(scenario.headers);

    // The existing useBreakpoints composable switches to the table at 768px.
    // Exercise phone and small-tablet cards without changing that behavior.
    for (const width of [390, 700]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(section.locator("table")).toHaveCount(0);
      for (const item of items) {
        const card = section.locator(`a[href='/item/${item.id}']`).first();
        await expect(card).toContainText(`Asset ID: ${item.assetId}`);
        await expect(card).toContainText(item.name);
        await expect(card).toContainText(String(item.quantity));
      }
    }
    await page.setViewportSize({ width: 834, height: 1000 });
    await expect(section.getByRole("columnheader", { name: "Asset ID" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 1000 });
    await section.locator(`a[href='/item/${items[0]!.id}']`).first().click();
    await expect(page).toHaveURL(`/item/${items[0]!.id}`);
  });
}
