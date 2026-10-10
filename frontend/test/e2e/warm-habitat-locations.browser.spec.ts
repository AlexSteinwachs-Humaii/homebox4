import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";
const expect = baseExpect.configure({ timeout: 30000 });

test.setTimeout(90000);

async function fixture(page: import("@playwright/test").Page) {
  await overviewFixture(page);
  const requests: string[] = [];
  const places = [
    {
      id: "attic",
      name: "Actual attic",
      type: "location",
      children: [
        {
          id: "trunk",
          name: "Storage trunk",
          type: "item",
          children: [{ id: "drawer", name: "Deep drawer", type: "location", children: [] }],
        },
        { id: "lamp", name: "Ordinary lamp", type: "item", children: [] },
      ],
    },
    { id: "garden", name: "Actual garden", type: "location", children: [] },
  ];
  await page.route("**/api/v1/entities?**", route => {
    const tenant = route.request().headers()["x-tenant"];
    requests.push(tenant || "");
    const url = new URL(route.request().url());
    return route.fulfill({ json: { items: tenant === "a" && url.searchParams.has("isLocation") ? places : [] } });
  });
  await page.route("**/api/v1/entities/tree?**", route =>
    route.fulfill({
      json: route.request().headers()["x-tenant"] === "a" ? places : [],
    })
  );
  await page.route(/\/api\/v1\/entities\/(attic|garden|drawer)(\/path)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().headers()["x-tenant"] !== "a")
      return route.fulfill({ status: 403, json: { error: "forbidden" } });
    if (path.endsWith("/path"))
      return route.fulfill({
        json: path.includes("drawer")
          ? [
              { id: "attic", name: "Actual attic", type: "location" },
              { id: "trunk", name: "Storage trunk", type: "item" },
            ]
          : [],
      });
    const id = path.split("/").at(-1)!;
    return route.fulfill({
      json: {
        id,
        name: id === "drawer" ? "Deep drawer" : places.find(place => place.id === id)!.name,
        description: `Contents of ${id}`,
        quantity: 1,
        createdAt: "2026-10-09",
        attachments: [],
        fields: [],
        tags: [],
        children: [],
      },
    });
  });
  return requests;
}

test("every root card and deep location entry navigates to its own contents", async ({ page }) => {
  await fixture(page);
  for (const [id, name] of [
    ["attic", "Actual attic"],
    ["garden", "Actual garden"],
  ]) {
    await page.goto("/locations");
    const card = page.getByRole("link", { name: `Open ${name}`, exact: true });
    await expect(card).toHaveAttribute("href", `/location/${id}`);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/location/${id}$`));
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByText(`Contents of ${id}`, { exact: true })).toBeVisible();
  }
  await page.goto("/locations");
  const expand = page.getByRole("button", { name: "Expand Actual attic", exact: true });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/locations/);
  await expect(page.getByRole("button", { name: "Collapse Actual attic" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Expand Storage trunk" }).focus();
  await page.keyboard.press("Space");
  const deep = page.getByRole("link", { name: "Deep drawer", exact: true });
  await expect(deep).toHaveAttribute("href", "/location/drawer");
  await page.getByRole("button", { name: "Hide Items" }).click();
  await expect(deep).toBeVisible();
  await expect(page.getByRole("link", { name: "Ordinary lamp", exact: true })).toHaveCount(0);
  await deep.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Deep drawer", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Actual attic", exact: true })).toHaveAttribute(
    "href",
    "/location/attic"
  );
  await expect(page.getByRole("link", { name: "Storage trunk", exact: true })).toHaveAttribute("href", "/item/trunk");
  // Reused route components must load the newly selected identity.
  await page.getByRole("link", { name: "Actual attic", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Actual attic", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deep drawer", exact: true })).toHaveCount(0);
});

test("collection changes use the new tenant and forbidden location references reveal no old record", async ({
  page,
}) => {
  const requests = await fixture(page);
  await page.goto("/locations");
  await expect(page.getByRole("heading", { name: "Actual attic", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Select Collection: First collection", exact: true }).first().click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByText("No locations available", { exact: false })).toBeVisible();
  expect(requests).toContain("b");
  await expect(page.getByRole("heading", { name: "Actual attic", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Create", { exact: true })).toBeVisible();
  await page.goto("/location/attic");
  await expect(page.getByRole("alert").filter({ hasText: "Failed to load location" })).toBeVisible();
  await expect(page.getByText("Contents of attic", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Actual attic", exact: true })).toHaveCount(0);
});

test("switching collection while viewing contents clears the previous record", async ({ page }) => {
  await fixture(page);
  await page.goto("/location/drawer");
  await expect(page.getByRole("heading", { name: "Deep drawer", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Select Collection: First collection", exact: true }).first().click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Failed to load location" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deep drawer", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Storage trunk", exact: true })).toHaveCount(0);
});
