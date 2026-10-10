import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const key = "homebox/preferences/location";
const password = "Claude-Rollout-Test-123!";
const settingsURL = "/api/v1/users/self/settings";

async function login(page: Page, email: string) {
  await page.goto("/");
  await page.locator("input[type=text]").fill(email);
  await page.locator("input[type=password]").fill(password);
  const response = page.waitForResponse("**/api/v1/users/login");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const { token } = await (await response).json();
  await expect(page).toHaveURL("/home");
  return token as string;
}

async function claude(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "claude");
  await expect(page.locator("html")).toHaveClass(/theme-claude/);
}

for (const stored of [null, "{broken", JSON.stringify({ theme: "dark", showEmpty: false, unknown: "retained" })]) {
  test(`prepaint and authenticated default with storage ${stored}`, async ({ page }) => {
    const email = `claude-${Date.now()}-${Math.random()}@example.com`;
    expect(
      (
        await page.request.post("/api/v1/users/register", {
          data: { email, password, name: "Claude Test" },
        })
      ).status()
    ).toBe(204);
    await page.goto("/");
    await page.evaluate(
      ({ key, stored }) => {
        localStorage.clear();
        if (stored !== null) localStorage.setItem(key, stored);
      },
      { key, stored }
    );
    // Disabling scripts proves the synchronous startup script, not Vue hydration, applies the palette.
    await page.route("**/_nuxt/**", route =>
      route.request().resourceType() === "script" ? route.abort() : route.continue()
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await claude(page);
    if (stored?.includes("retained")) {
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toMatchObject({
        theme: "claude",
        themeMigrationVersion: 1,
        showEmpty: false,
        unknown: "retained",
      });
    }
    await page.unroute("**/_nuxt/**");
    const token = await login(page, email);
    const response = await page.request.get(settingsURL, {
      headers: { Authorization: token },
    });
    expect((await response.json()).item).toMatchObject({
      theme: "claude",
      themeMigrationVersion: 1,
    });
    await claude(page);
    await page.reload();
    await claude(page);
  });
}

test("a deliberate theme choice survives reload and a second authenticated browser", async ({ page, browser }) => {
  const email = `claude-choice-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post("/api/v1/users/register", {
        data: { email, password, name: "Claude Choice" },
      })
    ).status()
  ).toBe(204);
  const token = await login(page, email);
  await claude(page);
  expect(
    (
      await page.request.put(settingsURL, {
        headers: { Authorization: token },
        data: {
          themeMigrationVersion: 1,
          theme: "claude",
          showEmpty: false,
          itemsPerTablePage: 24,
        },
      })
    ).ok()
  ).toBeTruthy();
  await page.reload();
  await page.goto("/profile");
  await page.locator("button[data-set-theme=night]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(settingsURL, {
              headers: { Authorization: token },
            })
          ).json()
        ).item.theme
    )
    .toBe("night");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await second.goto("/");
    await claude(second);
    await login(second, email);
    await expect(second.locator("html")).toHaveAttribute("data-theme", "night");
    await second.reload();
    await expect(second.locator("html")).toHaveAttribute("data-theme", "night");
    const response = await page.request.get(settingsURL, {
      headers: { Authorization: token },
    });
    expect((await response.json()).item).toMatchObject({
      theme: "night",
      showEmpty: false,
      itemsPerTablePage: 24,
    });
  } finally {
    await context.close();
  }
});

test("stale local theme cannot replace migrated server preferences", async ({ page }) => {
  const email = `claude-stale-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post("/api/v1/users/register", {
        data: { email, password, name: "Claude Stale" },
      })
    ).status()
  ).toBe(204);
  const token = await login(page, email);
  expect(
    (
      await page.request.put(settingsURL, {
        headers: { Authorization: token },
        data: {
          theme: "dark",
          showEmpty: false,
          itemsPerTablePage: 24,
          unknown: { preserved: true },
        },
      })
    ).ok()
  ).toBeTruthy();
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ theme: "dark", showEmpty: true })), key);
  await page.reload();
  await claude(page);
  await expect
    .poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).showEmpty, key))
    .toBe(false);
  expect(
    (
      await (
        await page.request.get(settingsURL, {
          headers: { Authorization: token },
        })
      ).json()
    ).item
  ).toMatchObject({
    theme: "claude",
    themeMigrationVersion: 1,
    showEmpty: false,
    itemsPerTablePage: 24,
    unknown: { preserved: true },
  });
});

test("missing server settings hydrate as Claude without a palette flash back", async ({ page }) => {
  const email = `claude-missing-${Date.now()}@example.com`;
  expect(
    (
      await page.request.post("/api/v1/users/register", {
        data: { email, password, name: "Claude Missing" },
      })
    ).status()
  ).toBe(204);
  // Reproduce an account whose settings endpoint has no saved preference, rather than a marked new account.
  await page.route("**/api/v1/users/self/settings", async route => {
    if (route.request().method() === "GET") await route.fulfill({ json: { item: {} } });
    else await route.continue();
  });
  await page.goto("/");
  await claude(page);
  await login(page, email);
  await claude(page);
  await page.reload();
  await claude(page);
});
