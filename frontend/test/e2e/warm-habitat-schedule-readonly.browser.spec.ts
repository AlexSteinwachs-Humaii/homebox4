import { test, expect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.use({ timezoneId: "America/Los_Angeles" });

const task = (id: string, scheduledDate: string) => ({
  id,
  name: `Recorded task ${id}`,
  description: `Recorded description ${id}`,
  itemID: `item-${id}`,
  itemName: `Recorded item ${id}`,
  scheduledDate,
  completedDate: "",
  cost: "0",
});

test("collection schedule is read-only and keeps stored calendar dates and order", async ({ page }) => {
  await overviewFixture(page);
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/maintenance") && request.method() !== "GET") mutations.push(request.method());
  });
  await page.route("**/api/v1/maintenance?**", route => {
    expect(new URL(route.request().url()).searchParams.get("status")).toBe("scheduled");
    return route.fulfill({ json: [task("undated", ""), task("past", "2000-01-01"), task("future", "2026-10-12")] });
  });
  await page.goto("/maintenance");
  await expect(page.getByRole("heading", { name: "Recorded task past" })).toBeVisible();
  const tasks = page.locator("section[aria-labelledby='maintenance-schedule-heading'] li");
  await expect(tasks).toHaveCount(3);
  await expect(tasks.nth(0)).toContainText("No due date recorded");
  await expect(tasks.nth(1)).toContainText("January 1st, 2000");
  await expect(tasks.nth(2)).toContainText("October 12th, 2026");
  await expect(tasks.nth(2)).toContainText("Recorded description future");
  await expect(page.getByRole("link", { name: "Recorded item past" })).toHaveAttribute("href", "/item/item-past");
  await expect(page.getByRole("button", { name: /Complete|Schedule task|New|Delete|Edit/, exact: true })).toHaveCount(
    0
  );
  await expect(page.getByText("Monthly Average", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(mutations).toEqual([]);
});

test("loading, error, retry and empty states do not masquerade as task data", async ({ page }) => {
  await overviewFixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  let failed = true;
  await page.route("**/api/v1/maintenance?**", async route => {
    await pending;
    await (failed ? route.fulfill({ status: 500, json: { error: "fixture failure" } }) : route.fulfill({ json: [] }));
  });
  await page.goto("/maintenance");
  await expect(page.getByRole("status").filter({ hasText: "Loading maintenance schedule" })).toBeVisible();
  await expect(page.getByText("No scheduled maintenance recorded in this collection.", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load the maintenance schedule" })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "No scheduled maintenance recorded" })).toBeVisible();
});
