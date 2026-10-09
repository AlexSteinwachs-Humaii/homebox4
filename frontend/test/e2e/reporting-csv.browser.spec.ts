import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createCollection(api: APIRequestContext) {
  const email = `csv-${crypto.randomUUID()}@example.com`;
  const password = "CSVTestPassword123!";
  const registration = await api.post("/api/v1/users/register", {
    data: { email, password, name: "CSV test", token: "" },
  });
  expect(registration.status()).toBe(204);
  const login = await api.post("/api/v1/users/login", { data: { username: email, password } });
  expect(login.ok()).toBe(true);
  const { token } = await login.json();
  // Login sets a session cookie; suppress the shared API context's cookie so
  // seeding two independent users always uses the intended bearer identity.
  const headers = { Authorization: token, Cookie: "" };
  const types = await api.get("/api/v1/entity-types", { headers });
  expect(types.ok(), await types.text()).toBe(true);
  const entityTypeId = (await types.json()).find((type: { isLocation: boolean }) => !type.isLocation).id;
  return { email, password, headers, entityTypeId };
}

async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/");
  await page.fill("input[type='text']", user.email);
  await page.fill("input[type='password']", user.password);
  await page.click("button[type='submit']");
  await expect(page).toHaveURL("/home");
}

test("downloads all filtered rows in column order without changing the current page", async ({ page, request }) => {
  test.slow();
  const user = await createCollection(request);
  const other = await createCollection(request);
  try {
    for (let i = 0; i < 37; i++) {
      const result = await request.post("/api/v1/entities", {
        headers: user.headers,
        data: {
          name: `CSV match ${String(i).padStart(2, "0")}`,
          description: "",
          entityTypeId: user.entityTypeId,
          quantity: 1,
          tagIds: [],
        },
      });
      expect(result.ok(), await result.text()).toBe(true);
    }
    for (const [owner, name] of [
      [user, "Excluded nonmatch"],
      [other, "CSV match other tenant"],
    ] as const) {
      const result = await request.post("/api/v1/entities", {
        headers: owner.headers,
        data: { name, description: "", entityTypeId: owner.entityTypeId, quantity: 1, tagIds: [] },
      });
      expect(result.ok(), await result.text()).toBe(true);
    }
    await signIn(page, user);
    await page.goto("/items?q=CSV%20match&page=2&orderBy=name");
    const button = page.getByRole("button", { name: "Export CSV", exact: true });
    await expect(button).toBeVisible();
    await expect(page.getByText("All filtered results, not just this page")).toBeVisible();
    const before = page.url();
    const downloadPromise = page.waitForEvent("download");
    const exportRequest = page.waitForRequest(r => r.url().includes("/reporting/filtered"));
    await button.click();
    const download = await downloadPromise;
    const params = new URL((await exportRequest).url()).searchParams;
    expect(params.get("q")).toBe("CSV match");
    expect(params.get("orderBy")).toBe("name");
    expect(params.has("page")).toBe(false);
    expect(JSON.parse(params.get("presentation")!).columns.map((c: { id: string }) => c.id)).toEqual([
      "name",
      "quantity",
      "insured",
      "purchasePrice",
    ]);
    expect(download.suggestedFilename()).toMatch(/^filtered-report-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile((await download.path())!, "utf8");
    const rows = csv.trimEnd().split("\n");
    expect(rows).toHaveLength(38);
    expect(rows[0]).toBe("Name,Quantity,Insured,Purchase Price");
    for (let i = 0; i < 37; i++) expect(rows[i + 1]).toContain(`CSV match ${String(i).padStart(2, "0")},`);
    expect(csv).not.toContain("Excluded");
    expect(csv).not.toContain("other tenant");
    expect(page.url()).toBe(before);
    await expect(button).toBeEnabled();

    await page.goto("/items?q=no-such-matching-result");
    const emptyDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const emptyCSV = await readFile((await (await emptyDownload).path())!, "utf8");
    expect(emptyCSV.trimEnd()).toBe("Name,Quantity,Insured,Purchase Price");
  } finally {
    await request.delete("/api/v1/users/self", { headers: user.headers });
    await request.delete("/api/v1/users/self", { headers: other.headers });
  }
});

test("shows progress, prevents duplicate export, and recovers from failure", async ({ page, request }) => {
  const user = await createCollection(request);
  try {
    await signIn(page, user);
    await page.goto("/items");
    let release!: () => void;
    let count = 0;
    await page.route("**/api/v1/reporting/filtered?*", async route => {
      count++;
      await new Promise<void>(resolve => {
        release = resolve;
      });
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"failed"}' });
    });
    const downloads: string[] = [];
    page.on("download", d => downloads.push(d.suggestedFilename()));
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    await expect(page.getByRole("button", { name: "Exporting…" })).toBeDisabled();
    expect(count).toBe(1);
    release();
    await expect(page.getByRole("alert").filter({ hasText: "Unable to export CSV. Please try again." })).toBeVisible();
    expect(downloads).toEqual([]);
    await page.unroute("**/api/v1/reporting/filtered?*");
    const retry = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    await retry;
    await expect(page.getByRole("button", { name: "Export CSV", exact: true })).toBeEnabled();
  } finally {
    await request.delete("/api/v1/users/self", { headers: user.headers });
  }
});
