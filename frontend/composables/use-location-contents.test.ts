import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLocationContents } from "./use-location-contents";
import type { ItemsApi } from "../lib/api/classes/items";

const result = (data: unknown, error: unknown = null) => ({ data, error });
function setup() {
  const collection = ref<string | null>("a");
  const id = ref("garage");
  const size = ref(12);
  const getLocation = vi.fn().mockResolvedValue(
    result({
      id: "garage",
      name: "Real garage",
      entityType: { isLocation: true },
      children: [{ id: "shelf", entityType: { isLocation: true } }],
    })
  );
  const getAll = vi.fn().mockResolvedValue(
    result({
      items: [{ id: "drill", quantity: 3, purchasePrice: 20 }],
      total: 31,
    })
  );
  const fullpath = vi.fn().mockResolvedValue(result([{ id: "garage", name: "Real garage" }]));
  const scope = effectScope();
  const state = scope.run(() =>
    useLocationContents(collection, id, size, () => ({ getLocation, getAll, fullpath }) as unknown as ItemsApi)
  )!;
  return { collection, id, size, getLocation, getAll, fullpath, scope, state };
}

describe("direct location contents", () => {
  it("requests direct children with pagination and uses the server total, not the page length or quantities", async () => {
    const f = setup();
    await vi.waitFor(() => expect(f.state.total.value).toBe(31));
    expect(f.getAll).toHaveBeenCalledWith({
      parentIds: ["garage"],
      page: 1,
      pageSize: 12,
    });
    expect(f.state.items.value).toEqual([{ id: "drill", quantity: 3, purchasePrice: 20 }]);
    expect(f.state.location.value?.children[0]?.id).toBe("shelf");
    f.state.page.value = 3;
    expect(f.state.items.value).toEqual([]);
    expect(f.state.total.value).toBe(0);
    await vi.waitFor(() =>
      expect(f.getAll).toHaveBeenLastCalledWith({
        parentIds: ["garage"],
        page: 3,
        pageSize: 12,
      })
    );
    f.id.value = "attic";
    expect(f.state.page.value).toBe(1);
    await vi.waitFor(() =>
      expect(f.getAll).toHaveBeenLastCalledWith({
        parentIds: ["attic"],
        page: 1,
        pageSize: 12,
      })
    );
    f.scope.stop();
  });

  it("does not query contents for missing, unauthorized or non-location records", async () => {
    const f = setup();
    await vi.waitFor(() => expect(f.state.loading.value).toBe(false));
    for (const record of [result(null, "404"), result(null, "403"), result({ entityType: { isLocation: false } })]) {
      f.getLocation.mockResolvedValueOnce(record);
      f.getAll.mockClear();
      await f.state.refresh();
      expect(f.state.unavailable.value).toBe(true);
      expect(f.state.location.value).toBeUndefined();
      expect(f.state.items.value).toEqual([]);
      expect(f.getAll).not.toHaveBeenCalled();
    }
    f.scope.stop();
  });

  it("distinguishes query failure and empty results and retries without stale records", async () => {
    const f = setup();
    await vi.waitFor(() => expect(f.state.total.value).toBe(31));
    f.getAll.mockResolvedValueOnce(result(null, "failed"));
    await f.state.refresh();
    expect(f.state.failed.value).toBe(true);
    expect(f.state.items.value).toEqual([]);
    expect(f.state.location.value).toBeUndefined();
    f.getAll.mockResolvedValueOnce(result({ items: [], total: 0 }));
    await f.state.refresh();
    expect(f.state.failed.value).toBe(false);
    expect(f.state.location.value?.name).toBe("Real garage");
    expect(f.state.total.value).toBe(0);
    f.scope.stop();
  });

  it("clears on collection switches, discards late responses and clears on deselection", async () => {
    const f = setup();
    await vi.waitFor(() => expect(f.state.total.value).toBe(31));
    let release!: (data: unknown) => void;
    f.getAll.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    f.collection.value = "b";
    expect(f.state.location.value).toBeUndefined();
    expect(f.state.loading.value).toBe(true);
    await vi.waitFor(() => expect(release).toBeDefined());
    f.collection.value = "c";
    await vi.waitFor(() => expect(f.state.total.value).toBe(31));
    release(result({ items: [{ id: "stale" }], total: 99 }));
    await Promise.resolve();
    expect(f.state.total.value).toBe(31);
    f.collection.value = null;
    expect(f.state.items.value).toEqual([]);
    expect(f.state.fullpath.value).toEqual([]);
    expect(f.state.total.value).toBe(0);
    expect(f.state.loading.value).toBe(false);
    f.scope.stop();
  });
});
