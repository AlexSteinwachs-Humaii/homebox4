import { expect, test } from "@playwright/test";
import { overviewFixture as fixture } from "./overview-fixture";

for (const width of [1440, 390]) {
  test(`overview hierarchy and real record context at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Item records", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recorded purchase value" })).toBeVisible();
    await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Real fixture possession", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture garage / Shelf", { exact: true })).toBeVisible();
    await expect(page.getByText("Quantity 3", { exact: true })).toBeVisible();
    await expect(page.locator("time")).toHaveText("10/09/2026");
    await expect(
      page.getByRole("img", {
        name: "Real fixture possession: No photo available",
      })
    ).toBeVisible();
    for (const title of ["Recently Added", "Quick actions", "Browse locations", "Make room for your next find."]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`overview-${width}.png`),
      fullPage: true,
    });
  });
}

test("pending, failures/retry, empty totals and switching collection are distinct", async ({ page }) => {
  const state = await fixture(page);
  state.pending = true;
  await page.goto("/home");
  await expect(page.getByText("Loading").first()).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
  state.failed = true;
  state.pending = false;
  await expect(page.getByRole("heading", { name: "Could not load collection statistics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load recent possessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load locations" })).toBeVisible();
  await expect(page.getByText("$0.00", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Real fixture possession", { exact: true })).toHaveCount(0);
  state.failed = false;
  state.empty = true;
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(page.getByText("$0.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Could not load recent possessions" })).toHaveCount(0);
  // Change the actual preferences ref through the real collection picker; verify X-Tenant is refreshed.
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByText("€0.00", { exact: true })).toBeVisible();
  expect(state.tenantRequests.filter(tenant => tenant === "b").length).toBeGreaterThanOrEqual(3);
});

test("entity mutations refresh totals, recent possessions and locations", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/home");
  await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Real fixture possession", { exact: true })).toBeVisible();
  const before = state.tenantRequests.length;
  state.updated = true;
  state.mutation();
  await expect(page.getByText("$120.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Updated fixture possession", { exact: true })).toBeVisible();
  expect(state.tenantRequests.length).toBeGreaterThanOrEqual(before + 3);
});

test("uses the real authenticated thumbnail URL and labels missing or failed photos", async ({ page }) => {
  const state = await fixture(page);
  state.photo = true;
  await page.goto("/home");
  const photo = page.locator("img[alt='Real fixture possession']");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("src", /\/entities\/tool\/attachments\/thumb/);
  expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(48);
  state.brokenPhoto = true;
  await page.reload();
  await expect(
    page.getByRole("img", {
      name: "Real fixture possession: No photo available",
    })
  ).toBeVisible();
});
