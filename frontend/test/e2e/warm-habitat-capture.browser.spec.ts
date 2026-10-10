import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
const expect = baseExpect.configure({ timeout: 30000 });

// Deterministic error injection; these tests do not claim backend persistence.
async function fixture(page: Page) {
  await overviewFixture(page);
  const state = {
    creates: 0,
    updates: 0,
    rejectCreate: false,
    rejectUpdate: false,
    rejectRead: false,
    uncertain: false,
    tenants: [] as string[],
  };
  await page.route("**/api/v1/entities/tree*", route =>
    route.fulfill({
      json: [{ id: "office", name: "Actual office", children: [] }],
    })
  );
  await page.route(/\/api\/v1\/entities\?.*isLocation=true/, route =>
    route.fulfill({
      json: { items: [{ id: "office", name: "Actual office" }] },
    })
  );
  await page.route("**/api/v1/entities", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    state.creates++;
    state.tenants.push(route.request().headers()["x-tenant"] ?? "missing");
    if (state.uncertain) return route.abort("failed");
    if (state.rejectCreate) return route.fulfill({ status: 422, json: { error: "rejected" } });
    return route.fulfill({
      status: 201,
      json: {
        ...route.request().postDataJSON(),
        id: "captured",
        entityType: { id: "item-type" },
        parent: { id: "office" },
        tags: [],
        fields: [],
      },
    });
  });
  let persisted = {
    id: "captured",
    name: "Recovery lamp",
    fields: [],
    tags: [],
    children: [],
    attachments: [],
  };
  await page.route("**/api/v1/entities/captured", async route => {
    if (route.request().method() !== "PUT") {
      if (state.rejectRead) return route.fulfill({ status: 403, json: { error: "forbidden" } });
      return route.fulfill({ json: persisted });
    }
    state.updates++;
    state.tenants.push(route.request().headers()["x-tenant"] ?? "missing");
    if (state.rejectUpdate) return route.fulfill({ status: 500, json: { error: "update failed" } });
    persisted = {
      ...persisted,
      ...route.request().postDataJSON(),
      // Canonical read data can differ from input; the confirmation must use this.
      name: "Recorded lamp",
      parent: { id: "office", name: "Actual office" },
      tags: [{ id: "tag", name: "Recorded tag" }],
    };
    return route.fulfill({ json: persisted });
  });
  await page.goto("/items/new?location=office");
  await expect(page.getByRole("heading", { name: "Item information" })).toBeVisible();
  return state;
}
async function fill(page: Page) {
  await page.getByLabel("Name *", { exact: false }).fill("Recovery lamp");
  await page.getByLabel("Description", { exact: false }).fill("Retained description");
  await page.getByLabel("Purchased From", { exact: false }).fill("Real shop");
  await page.getByLabel(/Purchase price/).fill("0");
}
async function retained(page: Page) {
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Recovery lamp");
  await expect(page.getByLabel("Description", { exact: false })).toHaveValue("Retained description");
  await expect(page.getByLabel("Purchased From", { exact: false })).toHaveValue("Real shop");
  await expect(page.getByLabel("Purchase price (USD)", { exact: true })).toHaveValue("0");
}

test("validation and rejected create retain input; Cancel before save makes no writes", async ({ page }) => {
  const state = await fixture(page);
  await fill(page);
  // Whitespace passes native required but must fail domain validation.
  await page.getByLabel("Name *", { exact: false }).fill("   ");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(state.creates).toBe(0);
  await fill(page);
  state.rejectCreate = true;
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("422");
  await retained(page);
  expect(state.updates).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  const writes = state.creates;
  await page.goto("/items/new?location=office");
  await fill(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/items$/);
  expect(state.creates).toBe(writes);
});

test("double submission and supplemental retry target one identity only", async ({ page }) => {
  const state = await fixture(page);
  await fill(page);
  state.rejectUpdate = true;
  // Two synchronous submit events exercise the handler guard independently of button disabling.
  await page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Item information" }) })
    .evaluate(form => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  await expect(page.getByRole("alert")).toContainText("500");
  await retained(page);
  expect(state.creates).toBe(1);
  expect(state.updates).toBe(1);
  await expect(page.getByRole("alert").getByRole("link")).toHaveAttribute("href", "/item/captured");
  state.rejectUpdate = false;
  await page.getByRole("button", { name: /Retry/ }).click();
  await expect(page).toHaveURL(/\/item\/captured$/);
  expect(state.creates).toBe(1);
  expect(state.updates).toBe(2);
  expect(state.tenants).toEqual(["a", "a", "a"]);
});

test("uncertain create preserves values and prevents another POST", async ({ page }) => {
  const state = await fixture(page);
  state.uncertain = true;
  await fill(page);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not confirm");
  await retained(page);
  await expect(page.getByRole("button", { name: "Save item", exact: true })).toBeDisabled();
  await page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Item information" }) })
    .evaluate(form => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(state.creates).toBe(1);
  expect(state.updates).toBe(0);
});

test("collection switch discards partial identity and entered values", async ({ page }) => {
  const state = await fixture(page);
  state.rejectUpdate = true;
  await fill(page);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("500");
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save item", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /captured/ })).toHaveCount(0);
  expect(state.tenants).toEqual(["a", "a"]);
});

test("saved confirmation uses authorized recorded values and cannot be replayed by URL or reload", async ({ page }) => {
  await fixture(page);
  await fill(page);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/captured$/);
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toContainText("Recorded lamp");
  await expect(page.getByRole("heading", { name: "Recorded lamp", exact: true })).toBeVisible();
  await expect(page.getByText("Real shop", { exact: true })).toBeVisible();
  await expect(page.getByText("Retained description", { exact: true })).toBeVisible();
  await expect(page.getByText("Recorded tag", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recorded lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
  await page.goto("/item/captured?saved=true");
  await expect(page.getByRole("heading", { name: "Recorded lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
});

test("saved next actions start a fresh capture and keep the selected collection", async ({ page }) => {
  const state = await fixture(page);
  await fill(page);
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toBeVisible();
  const back = page.getByRole("link", {
    name: "Back to Inventory",
    exact: true,
  });
  await expect(back).toHaveCount(2);
  for (const link of await back.all()) await expect(link).toHaveAttribute("href", "/items");
  const another = page.getByRole("link", {
    name: "Add another item",
    exact: true,
  });
  await expect(another).toHaveAttribute("href", "/items/new");
  await another.click();
  await expect(page).toHaveURL(/\/items\/new$/);
  await fresh(page);
  expect(state.creates).toBe(1);
  expect(state.updates).toBe(1);
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await fill(page);
  await page.getByRole("combobox", { name: "Parent Location", exact: true }).click();
  await page.getByRole("option", { name: /Actual office/ }).click();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toBeVisible();
  expect(state.tenants).toEqual(["a", "a", "b", "b"]);
  await page.getByRole("link", { name: "Back to Inventory", exact: true }).last().click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(
    page
      .getByRole("combobox", {
        name: "Select Collection: Second collection",
        exact: true,
      })
      .first()
  ).toBeVisible();
  expect(state.creates).toBe(2);
  expect(state.updates).toBe(2);
});

async function fresh(page: Page) {
  await expect(page.getByRole("heading", { name: "Item information" })).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("");
  await expect(page.getByLabel("Description", { exact: false })).toHaveValue("");
  await expect(page.getByLabel("Purchased From", { exact: false })).toHaveValue("");
  await expect(page.getByLabel(/Purchase price/)).toHaveValue("");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("1");
  await expect(page.locator(".dp__input")).toHaveValue("");
  await expect(page.getByLabel("Insured", { exact: true })).not.toBeChecked();
  await expect(page.getByText("Journey lighting", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
}

test("partial save and unauthorized confirmation fetch cannot show success", async ({ page }) => {
  const state = await fixture(page);
  await fill(page);
  state.rejectUpdate = true;
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("500");
  await page.getByRole("alert").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Recovery lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
  await page.goto("/items/new?location=office");
  await fill(page);
  state.rejectUpdate = false;
  state.rejectRead = true;
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/captured$/);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
  state.rejectRead = false;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recorded lamp", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Item saved", exact: true })).toHaveCount(0);
});

// Live API tests intentionally do not use overviewFixture or intercept entity responses.
for (const entry of ["/home", "/items"]) {
  test(`live capture from ${entry} persists core and purchase values through navigation and reload`, async ({
    page,
    request,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("homebox/preferences/location", JSON.stringify({ theme: "warm-habitat", language: "en" }))
    );
    const email = `capture-${crypto.randomUUID()}@example.com`;
    const password = "CaptureJourney!2026";
    const registration = await request.post("/api/v1/users/register", {
      data: { email, name: "Capture tester", password },
    });
    expect(registration.status()).toBe(204);
    await page.goto("/");
    await page.fill("input[type='text']", email);
    await page.fill("input[type='password']", password);
    await page.click("button[type='submit']");
    await expect(page).toHaveURL(/\/home$/);
    const typesResponse = await page.request.get("/api/v1/entity-types");
    expect(typesResponse.ok()).toBe(true);
    const types = await typesResponse.json();
    const locationResponse = await page.request.post("/api/v1/entities", {
      data: {
        name: "Journey office",
        description: "",
        quantity: 1,
        entityTypeId: types.find((type: { isLocation: boolean }) => type.isLocation).id,
        tagIds: [],
      },
    });
    expect(locationResponse.status()).toBe(201);
    const location = await locationResponse.json();
    const tagResponse = await page.request.post("/api/v1/tags", {
      data: {
        name: "Journey lighting",
        description: "",
        color: "#123456",
        icon: "",
      },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();
    await page.goto(entry);
    await page.getByRole("button", { name: "Add an item", exact: true }).first().click();
    await expect(page).toHaveURL(/\/items\/new$/);
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toHaveCount(0);
    await page.getByLabel("Name *", { exact: false }).fill("Persistent journey lamp");
    await page.getByRole("combobox", { name: "Parent Location", exact: true }).click();
    await page.getByRole("option", { name: /Journey office/ }).click();
    await page.getByLabel("Quantity", { exact: true }).fill("2.5");
    await page.getByLabel("Description", { exact: false }).fill("Persistent core description");
    await page.getByLabel("Purchased From", { exact: false }).fill("Journey store");
    await page.getByLabel(/Purchase price/).fill("0");
    await page.getByLabel("Insured", { exact: true }).click();
    await page.getByPlaceholder("Select Tags").fill("Journey lighting");
    await page.getByRole("option", { name: "Journey lighting", exact: true }).click();
    await page.getByLabel("Name *", { exact: false }).click();
    const dateInput = page.locator(".dp__input");
    await dateInput.click();
    await page.locator(".dp__today").click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const localDate = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });
    const created = page.waitForResponse(
      response => response.url().endsWith("/api/v1/entities") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Save item", exact: true }).dblclick();
    const record = await (await created).json();
    await expect(page).toHaveURL(new RegExp(`/item/${record.id}$`));
    await expect(page.getByRole("status", { name: "Item saved", exact: true })).toContainText(
      "Persistent journey lamp"
    );
    if (entry === "/home") {
      await page.getByRole("link", { name: "Add another item", exact: true }).click();
      await expect(page).toHaveURL(/\/items\/new$/);
      await fresh(page);
      // Leaving a new blank form does not write or delete either entity.
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    } else {
      await page.getByRole("link", { name: "Back to Inventory", exact: true }).last().click();
    }
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.locator(`a[href='/item/${record.id}']`)).toBeVisible();
    await page.reload();
    await page.locator(`a[href='/item/${record.id}']`).getByRole("heading").click();
    await expect(page).toHaveURL(new RegExp(`/item/${record.id}$`));
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Persistent journey lamp",
        exact: true,
      })
    ).toBeVisible();
    await expect(page.getByText("Persistent core description", { exact: true })).toBeVisible();
    await expect(page.getByText("Journey store", { exact: true })).toBeVisible();
    const persistedResponse = await page.request.get(`/api/v1/entities/${record.id}`);
    expect(persistedResponse.ok()).toBe(true);
    const persisted = await persistedResponse.json();
    expect(persisted).toMatchObject({
      name: "Persistent journey lamp",
      quantity: 2.5,
      description: "Persistent core description",
      purchasePrice: 0,
      purchaseFrom: "Journey store",
      purchaseDate: localDate,
      insured: true,
      parent: { id: location.id },
      entityType: {
        id: types.find((type: { isLocation: boolean }) => !type.isLocation).id,
      },
      tags: [{ id: tag.id }],
    });
    const rows = page.locator("dl > div");
    await expect(rows.filter({ hasText: "Quantity" }).locator("dd")).toHaveText("2.5");
    await expect(rows.filter({ hasText: "Insured" }).locator("dd")).toHaveText("Yes");
    await expect(page.getByText("Journey lighting", { exact: true })).toBeVisible();
    const listing = await (await page.request.get("/api/v1/entities?q=Persistent%20journey%20lamp")).json();
    expect(listing.items.filter((item: { id: string }) => item.id === record.id)).toHaveLength(1);
    expect(listing.items).toHaveLength(1);
    await page.getByRole("link", { name: "Overview", exact: true }).first().click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator(`a[href='/item/${record.id}']`)).toBeVisible();
    const statistics = page.getByRole("region", { name: "Quick statistics" });
    await expect(statistics).not.toHaveAttribute("aria-busy", "true");
    await expect(
      statistics.getByRole("link", { name: "Item records", exact: true }).locator("../..").locator("p").first()
    ).toHaveText("1");
    await page.reload();
    await expect(page.locator(`a[href='/item/${record.id}']`)).toBeVisible();
    await page.locator(`a[href='/item/${record.id}']`).click();
    await expect(
      page.getByRole("heading", {
        name: "Persistent journey lamp",
        exact: true,
      })
    ).toBeVisible();
  });
}
