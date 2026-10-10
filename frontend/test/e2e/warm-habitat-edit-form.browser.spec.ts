import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";

test.setTimeout(90000);
test.use({ actionTimeout: 15000 });
const expect = baseExpect.configure({ timeout: 30000 });

async function fixture(page: import("@playwright/test").Page, nested = true) {
  const events = await overviewFixture(page);
  const location = {
    id: "garage",
    name: "Actual garage",
    entityType: { id: "location-type", isLocation: true },
  };
  const record = {
    id: "record",
    name: "Recorded camera",
    description: "My camera description",
    quantity: 2.5,
    assetId: "123-456",
    manufacturer: "Actual maker",
    modelNumber: "CAM-X",
    serialNumber: "REAL-99",
    insured: true,
    archived: true,
    notes: "Keep me",
    fields: [{ id: "field", name: "Lens", textValue: "35mm", type: "text" }],
    tags: [{ id: "camera-tag", name: "Cameras" }],
    children: [],
    attachments: [
      { id: "receipt", title: "Original receipt", type: "receipt", mimeType: "application/pdf", path: "receipt.pdf" },
    ],
    entityType: { id: "item-type", name: "global.item", isLocation: false },
    parent: nested
      ? {
          id: "case",
          name: "Actual camera case",
          entityType: { id: "item-type", isLocation: false },
        }
      : location,
    location,
    syncChildEntityLocations: false,
    purchaseFrom: "Camera shop",
    purchasePrice: 42.5,
    purchaseDate: "2026-02-03",
    soldPrice: 17.25,
    soldTo: "Original buyer",
    soldDate: "2026-08-01",
    soldNotes: "Original sale notes",
    lifetimeWarranty: false,
    warrantyExpires: "",
    warrantyDetails: "Real warranty",
    createdAt: "2026-10-09",
    updatedAt: "2026-10-09",
  };
  const writes: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const state = { failed: false, failedAttachments: false, pending: false, gets: 0, tenants: [] as string[] };
  await page.route("**/api/v1/entities/record/path", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/entities/record/attachments/**", async route => {
    writes.push(route.request().method());
    if (state.failedAttachments) return route.fulfill({ status: 500, json: { error: "attachment failure" } });
    if (route.request().method() === "PUT") Object.assign(record.attachments[0]!, route.request().postDataJSON());
    if (route.request().method() === "DELETE") record.attachments = [];
    await route.fulfill({ json: record });
  });
  await page.route("**/api/v1/entities/record", async route => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().method());
      updates.push(route.request().postDataJSON());
      state.tenants.push(route.request().headers()["x-tenant"] || "");
      while (state.pending) await new Promise(resolve => setTimeout(resolve, 10));
      if (state.failed) return route.fulfill({ status: 422, json: { error: "fixture rejection" } });
      Object.assign(record, route.request().postDataJSON());
    } else state.gets++;
    if (route.request().headers()["x-tenant"] === "b")
      return route.fulfill({ status: 403, json: { error: "forbidden" } });
    await route.fulfill({ json: record });
  });
  await page.route("**/api/v1/entities/tree*", route => route.fulfill({ json: [location] }));
  await page.route("**/api/v1/tags", route => route.fulfill({ json: record.tags }));
  return { events, record, writes, updates, state };
}

test("edit loads actual grouped values, nested parent and immutable purchase context", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/item/record/edit");
  await expect(page.getByRole("heading", { name: "Edit Recorded camera" })).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Recorded camera");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2.5");
  for (const [label, value] of [
    ["Manufacturer", "Actual maker"],
    ["Model Number", "CAM-X"],
    ["Serial Number", "REAL-99"],
  ]) {
    await expect(page.getByLabel(label!, { exact: false })).toHaveValue(value!);
  }
  await expect(page.getByRole("combobox", { name: "Parent Location", exact: true })).toContainText("Actual garage");
  await expect(page.getByRole("combobox", { name: "Parent Item", exact: true })).toContainText("Actual camera case");
  await expect(page.locator("span").getByText("Cameras", { exact: true })).toBeVisible();
  const context = page.getByRole("complementary", { name: "Purchase context" });
  await expect(context).toContainText("$42.50");
  await expect(context).toContainText("February 3rd, 2026");
  await expect(context.locator("dl > div").filter({ hasText: "Archived" }).locator("dd")).toHaveText("Yes");
  await page.getByLabel("Name *", { exact: false }).fill("Unsaved camera");
  state.record.name = "External refresh";
  state.events.mutation();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Unsaved camera");
  await expect(context).toContainText("Recorded camera");
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByText("Custom Fields", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Purchased From", { exact: false })).toHaveValue("Camera shop");
  await expect(
    page.getByRole("heading", { name: "Warranty Details", exact: true }).locator("../..").getByRole("textbox").last()
  ).toHaveValue("Real warranty");
  await expect(page.getByRole("textbox", { name: /^Value/ })).toHaveValue("35mm");
  await expect(page.getByRole("heading", { name: "Attachments", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("direct location and mobile layout retain real values", async ({ page }) => {
  await fixture(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/item/record/edit");
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Recorded camera");
  await expect(page.getByRole("combobox", { name: "Parent Location", exact: true })).toContainText("Actual garage");
  await expect(page.getByRole("combobox", { name: "Parent Item", exact: true })).not.toContainText(
    "Actual camera case"
  );
  await expect(page.getByRole("complementary", { name: "Purchase context" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("changing collection discards the previous draft before forbidden response", async ({ page }) => {
  await fixture(page);
  await page.goto("/item/record/edit");
  await expect(page.getByLabel("Name *", { exact: false })).toBeVisible();
  await page
    .getByRole("combobox", {
      name: "Select Collection: First collection",
      exact: true,
    })
    .first()
    .click();
  await page.getByRole("option", { name: "Second collection" }).click();
  await expect(page.getByLabel("Name *", { exact: false })).toHaveCount(0);
  await expect(page.getByText("This item is unavailable or you do not have access to it.")).toBeVisible();
  await expect(page.getByText("Recorded camera", { exact: true })).toHaveCount(0);
});

test("Save roundtrips changed values and preserves all unrelated values on the same identity and collection", async ({
  page,
}) => {
  const { record, writes, updates, state } = await fixture(page);
  const original = structuredClone(record);
  await page.goto("/item/record/edit");
  await page.getByLabel("Name *", { exact: false }).fill("My updated camera");
  await page.getByLabel("Quantity", { exact: true }).fill("3.75");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/record$/);
  await expect(page.getByRole("heading", { name: "My updated camera", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "My updated camera", exact: true })).toBeVisible();
  expect(writes).toEqual(["PUT"]);
  expect(state.tenants).toEqual(["a"]);
  expect(updates[0]).toMatchObject({ id: "record", parentId: "case", entityTypeId: "item-type", quantity: 3.75 });
  for (const field of [
    "purchasePrice",
    "purchaseDate",
    "purchaseFrom",
    "soldPrice",
    "soldTo",
    "soldDate",
    "soldNotes",
    "warrantyExpires",
    "warrantyDetails",
    "lifetimeWarranty",
    "fields",
    "insured",
    "archived",
    "assetId",
    "notes",
  ] as const) {
    expect(updates[0]![field]).toEqual(original[field]);
  }
  expect(updates[0]!.tagIds).toEqual(["camera-tag"]);
  expect(record.attachments).toEqual(original.attachments);
  expect(state.gets).toBeGreaterThan(2);
});

for (const exit of ["Cancel", "Back to item", "browser back"]) {
  test(`${exit} discards edits and sync/attachment drafts without any request`, async ({ page }) => {
    const { record, writes } = await fixture(page);
    const original = structuredClone(record);
    await page.goto("/item/record");
    await page.locator('a[href="/item/record/edit"]').last().click();
    await page.getByLabel("Name *", { exact: false }).fill("Discard me");
    // Sync used to issue an immediate replacement update.
    await page.getByRole("switch", { name: /Sync.*Child.*Location/i, exact: false }).click();
    await page.getByText("Advanced", { exact: true }).click();
    await page
      .locator("input[type=file]")
      .setInputFiles({ name: "draft.txt", mimeType: "text/plain", buffer: Buffer.from("not saved") });
    await expect(page.getByText("Attachment changes waiting for Save:")).toBeVisible();
    if (exit === "browser back") await page.goBack();
    else if (exit === "Cancel") await page.getByRole("button", { name: exit, exact: true }).click();
    else await page.getByRole("link", { name: exit, exact: true }).click();
    await expect(page).toHaveURL(/\/item\/record$/);
    await expect(page.getByRole("heading", { name: "Recorded camera", exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(record).toEqual(original);
  });
}

test("invalid input stays local; failed update retains draft; repeated keyboard submit sends only one update", async ({
  page,
}) => {
  const { writes, state } = await fixture(page);
  await page.goto("/item/record/edit");
  const name = page.getByLabel("Name *", { exact: false });
  await name.fill("   ");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a name");
  expect(writes).toEqual([]);
  await name.fill("Retry camera");
  state.failed = true;
  state.pending = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+s");
  expect(writes).toEqual(["PUT"]);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  state.pending = false;
  await expect(page.getByRole("alert")).toContainText("Save failed (status 422)");
  await expect(name).toHaveValue("Retry camera");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  state.failed = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Retry camera", exact: true })).toBeVisible();
  expect(writes).toEqual(["PUT", "PUT"]);
});

test("advanced edits and queued attachment metadata save with partial-failure feedback and retry", async ({ page }) => {
  const { record, writes, state } = await fixture(page);
  await page.goto("/item/record/edit");
  await page.getByLabel("Name *", { exact: false }).fill("Advanced camera");
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Purchased From", { exact: false }).fill("Updated shop");
  await page.getByRole("textbox", { name: /^Value/ }).fill("50mm");
  const receipt = page.getByRole("listitem").filter({ hasText: "Original receipt" });
  await receipt.getByRole("button").last().click();
  await page.getByRole("dialog").getByLabel("Attachment Title", { exact: false }).fill("Updated receipt");
  await page.getByRole("dialog").getByRole("button", { name: "Update", exact: true }).click();
  expect(writes).toEqual([]);
  state.failedAttachments = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Item values were saved, but an attachment change failed");
  await expect(page.getByLabel("Name *", { exact: false })).toHaveValue("Advanced camera");
  expect(record.name).toBe("Advanced camera");
  expect(record.attachments[0]!.title).toBe("Original receipt");
  state.failedAttachments = false;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/item\/record$/);
  await expect(page.getByRole("heading", { name: "Advanced camera", exact: true })).toBeVisible();
  expect(record.purchaseFrom).toBe("Updated shop");
  expect(record.fields[0]!.textValue).toBe("50mm");
  expect(record.attachments[0]!.title).toBe("Updated receipt");
  expect(writes).toEqual(["PUT", "PUT", "PUT", "PUT"]);
});
