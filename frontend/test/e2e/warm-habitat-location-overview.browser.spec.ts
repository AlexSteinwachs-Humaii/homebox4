import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";
const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(90000);

test("real root cards and mixed deep hierarchy replace examples", async ({ page }) => {
  await overviewFixture(page);
  await page.route("**/api/v1/entities?**", route =>
    route.fulfill({
      json: {
        items: [
          {
            id: "attic",
            name: "Actual attic",
            description: "Seasonal storage",
          },
          { id: "garden", name: "Actual garden" },
        ],
      },
    })
  );
  let branch = {
    id: "deep",
    name: "Deep place",
    type: "location",
    children: [] as unknown[],
  };
  for (let i = 0; i < 15; i++)
    branch = {
      id: `container-${i}`,
      name: `Container ${i}`,
      type: "item",
      children: [branch],
    };
  await page.route("**/api/v1/entities/tree?**", route =>
    route.fulfill({
      json: [
        {
          id: "attic",
          name: "Actual attic",
          type: "location",
          children: [branch, { id: "lamp", name: "Unrelated lamp", type: "item", children: [] }],
        },
      ],
    })
  );
  await page.goto("/locations?locationTree=malformed");
  await expect(page.getByRole("heading", { name: "Actual attic", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actual garden", exact: true })).toBeVisible();
  await expect(page.getByText("Garage", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Tree" }).click();
  await expect(page.getByRole("link", { name: "Deep place", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide Items" }).click();
  await expect(page.getByRole("link", { name: "Deep place", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Container 0", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unrelated lamp", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("loading, failure, retry and empty are distinct", async ({ page }) => {
  await overviewFixture(page);
  let fail = true;
  await page.route("**/api/v1/entities?**", route =>
    fail ? route.fulfill({ status: 500, json: { error: "fixture failure" } }) : route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/entities/tree?**", route => route.fulfill({ json: [] }));
  await page.goto("/locations");
  await expect(page.getByRole("alert").filter({ hasText: "Your spaces could not be loaded" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No locations available", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Create", { exact: true })).toBeVisible();
});

test("loading does not show empty or stale places", async ({ page }) => {
  await overviewFixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/v1/entities?**", async route => {
    await pending;
    await route.fulfill({
      json: { items: [{ id: "shed", name: "Real shed" }] },
    });
  });
  await page.route("**/api/v1/entities/tree?**", route => route.fulfill({ json: [] }));
  await page.goto("/locations");
  await expect(page.getByRole("status").filter({ hasText: "Loading your spaces" })).toBeVisible();
  await expect(page.getByText("No locations available", { exact: false })).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Real shed", exact: true })).toBeVisible();
});
