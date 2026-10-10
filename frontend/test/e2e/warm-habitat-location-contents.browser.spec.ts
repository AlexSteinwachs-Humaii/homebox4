import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";
const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(90000);

test("authorized direct contents use paginated totals, units and a real trail", async ({ page }) => {
  await overviewFixture(page);
  const queries: URL[] = [];
  await page.route("**/api/v1/entities/garage", route =>
    route.fulfill({
      json: {
        id: "garage",
        name: "Actual garage",
        entityType: { isLocation: true },
        description: "Tools live here",
        attachments: [],
        fields: [],
        tags: [],
        children: [
          {
            id: "shelf",
            name: "Child shelf",
            entityType: { isLocation: true },
          },
        ],
      },
    })
  );
  await page.route("**/api/v1/entities/garage/path", route =>
    route.fulfill({
      json: [
        { id: "home", name: "Actual home", type: "location" },
        { id: "garage", name: "Actual garage", type: "location" },
      ],
    })
  );
  await page.route("**/api/v1/entities?**", route => {
    const url = new URL(route.request().url());
    queries.push(url);
    const index = Number(url.searchParams.get("page") || "1");
    return route.fulfill({
      json: {
        items: [
          {
            id: `tool-${index}`,
            name: `Direct tool ${index}`,
            quantity: 3,
            purchasePrice: 20,
            assetId: "000-001",
            tags: [],
          },
        ],
        total: 31,
      },
    });
  });
  await page.goto("/location/garage");
  await expect(page.getByRole("heading", { name: "Actual garage", exact: true })).toBeVisible();
  await expect(page.getByText("Directly in this location", { exact: true })).toBeVisible();
  await expect(page.getByText("Actual home", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("31 direct item records", { exact: false })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Direct tool 1" });
  await expect(row.getByRole("cell", { name: "3", exact: true })).toBeVisible();
  await expect(row).toContainText("$20.00");
  await expect(page.getByRole("table")).not.toContainText("Child shelf");
  expect(queries.at(-1)?.searchParams.get("parentIds")).toBe("garage");
  expect(Number(queries.at(-1)?.searchParams.get("pageSize"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Direct tool 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Direct tool 1", { exact: true })).toHaveCount(0);
  expect(queries.at(-1)?.searchParams.get("page")).toBe("2");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("unavailable, loading, failed and empty contents never show old records", async ({ page }) => {
  await overviewFixture(page);
  let missing = true;
  let fail = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/v1/entities/garage", route =>
    missing
      ? route.fulfill({ status: 404, json: {} })
      : route.fulfill({
          json: {
            id: "garage",
            name: "Actual garage",
            entityType: { isLocation: true },
            attachments: [],
            fields: [],
            tags: [],
            children: [],
          },
        })
  );
  await page.route("**/api/v1/entities/garage/path", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/entities?**", async route => {
    if (pending) await pending;
    return fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto("/location/garage");
  await expect(page.getByRole("alert")).toContainText("This location is unavailable");
  missing = false;
  fail = true;
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Loading" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  release();
  await expect(page.getByRole("alert")).toContainText("Failed");
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("No item records directly in this location.", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByText("0 direct item records", { exact: false })).toBeVisible();
});
