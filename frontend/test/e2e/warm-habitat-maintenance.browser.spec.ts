import { test, expect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.use({ timezoneId: "America/Los_Angeles" });
const task = (id: string, itemID: string, scheduledDate: string) => ({
  id,
  itemID,
  itemName: `Stored ${itemID}`,
  name: `Task ${id}`,
  description: `Care ${id}`,
  scheduledDate,
  completedDate: "",
});

test("real task identities, authorized context and separate inventory/item navigation", async ({ page }) => {
  await overviewFixture(page);
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/v1/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      mutations.push(request.url());
  });
  const contexts: string[] = [];
  await page.route("**/api/v1/maintenance?**", route => {
    expect(new URL(route.request().url()).searchParams.get("status")).toBe("scheduled");
    return route.fulfill({
      json: [task("past", "tool", "2000-01-01"), task("missing", "tent", ""), task("repeat", "tool", "2026-10-12")],
    });
  });
  await page.route("**/api/v1/entities/tool", route => {
    contexts.push(route.request().headers()["x-tenant"]!);
    return route.fulfill({
      json: {
        id: "tool",
        name: "Actual authorized tool",
        description: "Actual specifications",
        location: { id: "garage", name: "Actual garage" },
        parent: { id: "case", name: "Tool case" },
        attachments: [],
        fields: [],
        tags: [],
        children: [],
      },
    });
  });
  await page.route("**/api/v1/entities/tent", route => route.fulfill({ status: 403, json: {} }));
  await page.goto("/maintenance");
  const schedule = page.locator("section[aria-labelledby='maintenance-schedule-heading']");
  await expect(schedule.getByRole("heading", { name: "Actual authorized tool" })).toBeVisible();
  await expect(schedule).toContainText("Actual specifications");
  await expect(schedule.locator("time").first()).toHaveAttribute("datetime", "2000-01-01");
  await expect(schedule.locator("time").first()).toContainText("January 1st, 2000");
  await expect(schedule).toContainText("No due date recorded");
  await expect(schedule.getByText("Item and location context unavailable", { exact: true })).toBeVisible();
  await expect(schedule.getByRole("link", { name: "Actual garage" }).first()).toHaveAttribute(
    "href",
    "/location/garage"
  );
  await expect(schedule.getByRole("link", { name: "Tool case" }).first()).toHaveAttribute("href", "/item/case");
  await expect(schedule.getByRole("link", { name: "Stored tool" })).toHaveCount(2);
  for (const link of await schedule.getByRole("link", { name: "Stored tool" }).all())
    await expect(link).toHaveAttribute("href", "/item/tool");
  await expect(schedule.getByRole("link", { name: "Stored tent" })).toHaveAttribute("href", "/item/tent");
  expect(contexts).toEqual(["a"]);
  await page.getByRole("link", { name: "Open item details", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/tool$/);
  await expect(page.getByRole("link", { name: "Collection maintenance schedule", exact: true })).toHaveAttribute(
    "href",
    "/maintenance"
  );
  await expect(page.getByRole("link", { name: "Item maintenance", exact: true })).toHaveAttribute(
    "href",
    "/item/tool/maintenance"
  );
  await page.getByRole("link", { name: "Collection maintenance schedule", exact: true }).click();
  await page.getByRole("link", { name: "View Inventory", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  expect(mutations).toEqual([]);
});

test("loading, schedule error, empty and collection context isolation", async ({ page }) => {
  await overviewFixture(page);
  let failed = true;
  let empty = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/v1/maintenance?**", async route => {
    await pending;
    const tenant = route.request().headers()["x-tenant"];
    return failed
      ? route.fulfill({ status: 500, json: {} })
      : route.fulfill({ json: empty || tenant === "b" ? [] : [task("one", "tool", "2026-10-12")] });
  });
  await page.goto("/maintenance");
  await expect(page.getByText("Loading maintenance schedule…")).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Unable to load");
  failed = false;
  empty = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No scheduled maintenance recorded in this collection.")).toBeVisible();
  empty = false;
  await page.reload();
  await expect(page.getByText("Task one", { exact: true })).toBeVisible();
  // Collection selector uses the existing shell, not an invented schedule filter.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByText("No scheduled maintenance recorded in this collection.")).toBeVisible();
  await expect(page.getByText("Task one", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recorded task item" })).toHaveCount(0);
});
