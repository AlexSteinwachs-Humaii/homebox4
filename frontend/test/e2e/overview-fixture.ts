import type { Page } from "@playwright/test";

// Presentation/data-lifecycle tests use explicit API fixtures, never production seed records.
export async function overviewFixture(page: Page) {
  const state = {
    failed: false,
    empty: false,
    tenantRequests: [] as string[],
    pending: false,
    updated: false,
    photo: false,
    brokenPhoto: false,
    mutation: () => {},
  };
  await page.routeWebSocket("**/api/v1/ws/events*", socket => {
    state.mutation = () => socket.send(JSON.stringify({ event: "entity.mutation" }));
  });
  await page.context().addCookies([
    {
      name: "hb.auth.session",
      value: "true",
      url: process.env.E2E_BASE_URL || "http://localhost:3000",
    },
    {
      name: "hb.auth.attachment_token",
      value: "fixture-token",
      url: process.env.E2E_BASE_URL || "http://localhost:3000",
    },
  ]);
  await page.addInitScript(() => {
    if (!localStorage.getItem("homebox/preferences/location")) {
      localStorage.setItem(
        "homebox/preferences/location",
        JSON.stringify({
          theme: "warm-habitat",
          language: "en",
          collectionId: "a",
        })
      );
    }
  });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const tenant = route.request().headers()["x-tenant"] || "a";
    const dataRequest = path === "/groups/statistics" || path === "/entities";
    if (dataRequest) state.tenantRequests.push(tenant);
    if (state.pending && dataRequest) {
      await new Promise<void>(resolve => {
        const timer = setInterval(() => {
          if (!state.pending) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
    }
    if (state.failed && dataRequest) return route.fulfill({ status: 500, json: { error: "fixture failure" } });
    if (path === "/entities/tool/attachments/thumb") {
      if (state.brokenPhoto) return route.fulfill({ status: 404 });
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="gray"/></svg>',
      });
    }
    const item = {
      id: "tool",
      name: state.updated ? "Updated fixture possession" : "Real fixture possession",
      quantity: 3,
      thumbnailId: state.photo ? "thumb" : null,
      imageId: state.photo ? "original" : null,
      purchasePrice: 20,
      createdAt: "2026-10-09T12:00:00Z",
      parent: { id: "shelf", name: "Shelf" },
      tags: [],
      archived: false,
    };
    let data: unknown = {};
    if (path === "/users/self")
      data = {
        item: {
          id: "user",
          name: "Household tester",
          email: "fixture@example.invalid",
          defaultGroupId: "a",
        },
      };
    else if (path === "/users/self/settings") data = {};
    else if (path === "/groups/all")
      data = [
        { id: "a", name: "First collection", currency: "USD" },
        { id: "b", name: "Second collection", currency: "EUR" },
      ];
    else if (path === "/groups")
      data = {
        id: tenant,
        name: tenant === "a" ? "First collection" : "Second collection",
        currency: tenant === "a" ? "USD" : "EUR",
      };
    else if (path === "/groups/statistics")
      data = {
        totalItems: state.empty || tenant === "b" ? 0 : 1,
        totalItemPrice: state.empty || tenant === "b" ? 0 : state.updated ? 120 : 60,
        totalLocations: state.empty || tenant === "b" ? 0 : 1,
        totalTags: 0,
      };
    else if (path === "/entities")
      data = {
        items:
          state.empty || tenant === "b"
            ? []
            : url.searchParams.get("isLocation") === "true"
              ? [{ ...item, id: "garage", name: "Fixture garage" }]
              : [item],
        total: 1,
        page: 1,
        pageSize: 5,
      };
    else if (path === "/entities/tool" || path === "/entities/garage")
      data = {
        ...item,
        id: path.split("/").at(-1),
        name: path.endsWith("garage") ? "Fixture garage" : item.name,
        attachments: [],
        fields: [],
        children: [],
        description: "",
        isLocation: path.endsWith("garage"),
      };
    else if (path === "/entities/tool/path")
      data = [
        { id: "garage", name: "Fixture garage" },
        { id: "shelf", name: "Shelf" },
        { id: "tool", name: item.name },
      ];
    else if (path === "/groups/currencies") data = [];
    else if (path === "/status")
      data = {
        allowRegistration: true,
        build: { version: "v1.0.0", commit: "fixture" },
        latest: { version: "v1.0.0" },
      };
    else if (path === "/entity-types")
      data = [
        { id: "item-type", name: "global.item", isLocation: false },
        { id: "location-type", name: "global.location", isLocation: true },
      ];
    else if (path === "/entities/tree" || path === "/tags" || path.endsWith("/log")) data = [];
    await route.fulfill({ json: data });
  });
  return state;
}
