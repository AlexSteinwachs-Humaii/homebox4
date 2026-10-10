import { describe, expect, it, vi } from "vitest";
import type { UserClient } from "../../lib/api/user";
import { loadStatistics } from "./statistics";
import { loadRecentItems } from "./table";

function client() {
  return {
    stats: {
      group: vi.fn().mockResolvedValue({
        data: { totalItems: 1, totalItemPrice: 60, totalLocations: 2, totalTags: 3 },
        error: null,
      }),
    },
    group: { get: vi.fn().mockResolvedValue({ data: { currency: "EUR" }, error: null }) },
    items: {
      getAll: vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              id: "tool",
              name: "Tool",
              quantity: 3,
              purchasePrice: 20,
              createdAt: "2026-10-09",
              imageId: "photo",
              thumbnailId: "thumb",
            },
          ],
        },
        error: null,
      }),
      fullpath: vi.fn().mockResolvedValue({
        data: [
          { id: "garage", name: "Garage" },
          { id: "shelf", name: "Shelf" },
          { id: "tool", name: "Tool" },
        ],
        error: null,
      }),
    },
  };
}
const asApi = (api: ReturnType<typeof client>) => api as unknown as UserClient;

describe("truthful overview data adapters", () => {
  it("keeps server record count and recorded value (price × quantity), with this collection's currency", async () => {
    const api = client();
    const stats = await loadStatistics(asApi(api));
    expect(stats.totalItems).toBe(1); // one record, not its three physical units
    expect(stats.totalItemPrice).toBe(20 * 3);
    expect(stats.currency).toBe("EUR");
  });

  it("accepts successful zero totals without converting failed requests to zeros", async () => {
    const api = client();
    api.stats.group.mockResolvedValueOnce({
      data: { totalItems: 0, totalItemPrice: 0, totalLocations: 0, totalTags: 0 },
      error: null,
    });
    expect((await loadStatistics(asApi(api))).totalItemPrice).toBe(0);
    api.stats.group.mockResolvedValueOnce({ data: null, error: "offline" });
    await expect(loadStatistics(asApi(api))).rejects.toThrow("Unable to load");
    api.stats.group.mockResolvedValueOnce({ data: {}, error: null });
    await expect(loadStatistics(asApi(api))).rejects.toThrow("Unable to load");
    api.group.get.mockResolvedValueOnce({ data: null, error: "offline" });
    await expect(loadStatistics(asApi(api))).rejects.toThrow("Unable to load");
  });

  it("requests the five newest nonarchived item records and retains real names, photos, quantity, dates and full trails", async () => {
    const api = client();
    const rows = await loadRecentItems(asApi(api));
    expect(api.items.getAll).toHaveBeenCalledWith({
      page: 1,
      pageSize: 5,
      orderBy: "createdAt",
      includeArchived: false,
    });
    expect(api.items.fullpath).toHaveBeenCalledWith("tool");
    expect(rows[0]).toMatchObject({
      id: "tool",
      name: "Tool",
      quantity: 3,
      createdAt: "2026-10-09",
      thumbnailId: "thumb",
      locationTrail: "Garage / Shelf",
    });
  });

  it("returns a genuine empty collection and reports list/path failures rather than sample records", async () => {
    const api = client();
    api.items.getAll.mockResolvedValueOnce({ data: { items: [] }, error: null });
    expect(await loadRecentItems(asApi(api))).toEqual([]);
    api.items.getAll.mockResolvedValueOnce({ data: null, error: "offline" });
    await expect(loadRecentItems(asApi(api))).rejects.toThrow("Unable to load");
    api.items.fullpath.mockResolvedValueOnce({ data: null, error: "offline" });
    await expect(loadRecentItems(asApi(api))).rejects.toThrow("location trail");
  });
});
