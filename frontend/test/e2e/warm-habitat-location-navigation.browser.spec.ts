import { test, expect as baseExpect } from "@playwright/test";
import { overviewFixture } from "./overview-fixture";
const expect = baseExpect.configure({ timeout: 30000 });
test.setTimeout(90000);

for (const emptyParent of [false, true]) {
  test(`child scope and escape routes preserve identities (empty parent: ${emptyParent})`, async ({ page }) => {
    await overviewFixture(page);
    const collection = emptyParent ? "b" : "a";
    await page.addInitScript(collectionId => {
      const preferences = JSON.parse(localStorage.getItem("homebox/preferences/location")!);
      localStorage.setItem("homebox/preferences/location", JSON.stringify({ ...preferences, collectionId }));
    }, collection);
    const queries: {
      id: string | null;
      page: string | null;
      tenant: string | undefined;
    }[] = [];
    const garage = { id: "garage", name: "Real garage", type: "location" };
    const shelf = { id: "shelf", name: "Real shelf", type: "location" };
    const drill = {
      id: "drill",
      name: "Actual drill",
      entityType: { id: "item-type", isLocation: false },
      parent: shelf,
      location: shelf,
      quantity: 3,
      purchasePrice: 20,
      soldPrice: 0,
      assetId: "001-002",
      attachments: [],
      tags: [],
      fields: [],
      children: [],
      createdAt: "2026-10-09",
      updatedAt: "2026-10-09",
    };
    await page.route(/\/api\/v1\/entities\/(garage|shelf|drill)(\/path)?$/, route => {
      const path = new URL(route.request().url()).pathname;
      const id = path.split("/").at(path.endsWith("/path") ? -2 : -1);
      if (path.endsWith("/path")) {
        const trail =
          id === "garage" ? [garage] : id === "shelf" ? [garage, shelf] : [garage, shelf, { ...drill, type: "item" }];
        return route.fulfill({ json: trail });
      }
      return route.fulfill({
        json:
          id === "drill"
            ? drill
            : {
                ...(id === "garage" ? garage : shelf),
                entityType: { id: "location-type", isLocation: true },
                children: id === "garage" ? [{ ...shelf, entityType: { isLocation: true } }] : [],
                attachments: [],
                tags: [],
                fields: [],
              },
      });
    });
    await page.route("**/api/v1/entities?**", route => {
      const url = new URL(route.request().url());
      const id = url.searchParams.get("parentIds");
      queries.push({
        id,
        page: url.searchParams.get("page"),
        tenant: route.request().headers()["x-tenant"],
      });
      return route.fulfill({
        json: {
          items:
            id === "shelf" || !id
              ? [drill]
              : emptyParent
                ? []
                : [{ ...shelf, entityType: { isLocation: true }, tags: [] }],
          total: id === "garage" ? (emptyParent ? 0 : 31) : 1,
        },
      });
    });
    await page.goto("/location/garage");
    await expect(page.getByRole("heading", { name: "Real garage", exact: true })).toBeVisible();
    if (!emptyParent) {
      // Location rows stay location-aware, even while pagination changes.
      await expect(page.getByRole("table").getByRole("link", { name: /Real shelf/ })).toHaveAttribute(
        "href",
        "/location/shelf"
      );
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect.poll(() => queries.at(-1)?.page).toBe("2");
      await expect(page.getByRole("heading", { name: "Real garage", exact: true })).toBeVisible();
    } else {
      await expect(
        page.getByText("No item records directly in this location.", {
          exact: false,
        })
      ).toBeVisible();
    }
    const children = page.getByRole("navigation", {
      name: "Child Locations",
      exact: true,
    });
    await children.getByRole("link", { name: "Real shelf", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/location\/shelf$/);
    await expect(page.getByRole("heading", { name: "Real shelf", exact: true })).toBeVisible();
    expect(queries.at(-1)).toEqual({ id: "shelf", page: "1", tenant: collection });
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await page
      .getByRole("table")
      .getByRole("link", { name: /Actual drill/ })
      .click();
    await expect(page).toHaveURL(/\/item\/drill$/);
    await expect(page.getByRole("heading", { name: "Actual drill", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Real shelf", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Real shelf", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View inventory", exact: true }).click();
    await expect(page).toHaveURL(/\/items$/);
    await page
      .getByRole("link", { name: /Actual drill/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Actual drill", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to Inventory", exact: true }).first().click();
    await expect(page).toHaveURL(/\/items$/);
    await page.goBack();
    await page.getByRole("link", { name: "Real shelf", exact: true }).click();
    await page.getByRole("link", { name: "Back to Locations", exact: true }).click();
    await expect(page).toHaveURL(/\/locations$/);
    expect(queries.every(query => query.tenant === collection)).toBe(true);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("homebox/preferences/location")!).collectionId)
    ).toBe(collection);
  });
}
