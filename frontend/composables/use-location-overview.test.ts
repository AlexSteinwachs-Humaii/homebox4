import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { locationBranches, useLocationOverview } from "./use-location-overview";
import type { ItemsApi } from "../lib/api/classes/items";
import type { TreeItem } from "../lib/api/types/data-contracts";

const node = (id: string, type = "location", children: TreeItem[] = []): TreeItem => ({ id, name: id, type, children });
const result = (data: unknown, error: unknown = null) => ({ data, error });

function setup(getLocations = vi.fn().mockResolvedValue(result([])), getTree = vi.fn().mockResolvedValue(result([]))) {
  const collection = ref<string | null>("a");
  const scope = effectScope();
  const state = scope.run(() =>
    useLocationOverview(collection, {
      getLocations,
      getTree,
    } as unknown as ItemsApi)
  )!;
  return { collection, state, scope, getLocations, getTree };
}

describe("collection location overview", () => {
  it("resolves a fresh collection-bound API client for every refresh", async () => {
    const collection = ref<string | null>("a");
    const tenants: string[] = [];
    const scope = effectScope();
    const state = scope.run(() =>
      useLocationOverview(collection, () => {
        const tenant = collection.value!;
        tenants.push(tenant);
        return {
          getLocations: vi.fn().mockResolvedValue(result([{ id: tenant, name: tenant }])),
          getTree: vi.fn().mockResolvedValue(result([])),
        } as unknown as ItemsApi;
      })
    )!;
    await vi.waitFor(() => expect(state.roots.value[0]?.id).toBe("a"));
    collection.value = "b";
    expect(state.roots.value).toEqual([]);
    await vi.waitFor(() => expect(state.roots.value[0]?.id).toBe("b"));
    expect(tenants).toEqual(["a", "b"]);
    scope.stop();
  });
  it("requests actual root locations and the full mixed hierarchy", async () => {
    const fixture = setup(vi.fn().mockResolvedValue(result([{ id: "real-root", name: "Attic" }])));
    await vi.waitFor(() => expect(fixture.state.loading.value).toBe(false));
    expect(fixture.getLocations).toHaveBeenCalledWith({ filterChildren: true });
    expect(fixture.getTree).toHaveBeenCalledWith({ withItems: true });
    expect(fixture.state.roots.value[0]?.name).toBe("Attic");
    fixture.scope.stop();
  });

  it("distinguishes empty from failure and supports retry", async () => {
    const fixture = setup(vi.fn().mockResolvedValueOnce(result([], "failed")).mockResolvedValue(result([])));
    await vi.waitFor(() => expect(fixture.state.failed.value).toBe(true));
    expect(fixture.state.roots.value).toEqual([]);
    await fixture.state.refresh();
    expect(fixture.state.failed.value).toBe(false);
    expect(fixture.state.tree.value).toEqual([]);
    fixture.scope.stop();
  });

  it("clears old records immediately and ignores delayed responses after switching", async () => {
    let finish!: (value: unknown) => void;
    const fixture = setup(
      vi
        .fn()
        .mockResolvedValueOnce(result([{ id: "old" }]))
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              finish = resolve;
            })
        )
        .mockResolvedValue(result([{ id: "new" }]))
    );
    await vi.waitFor(() => expect(fixture.state.loading.value).toBe(false));
    fixture.collection.value = "b";
    expect(fixture.state.roots.value).toEqual([]);
    fixture.collection.value = "c";
    await vi.waitFor(() => expect(fixture.state.roots.value[0]?.id).toBe("new"));
    finish(result([{ id: "late" }]));
    await Promise.resolve();
    expect(fixture.state.roots.value[0]?.id).toBe("new");
    fixture.collection.value = null;
    expect(fixture.state.roots.value).toEqual([]);
    expect(fixture.state.tree.value).toEqual([]);
    fixture.scope.stop();
  });

  it("preserves deep item-container ancestry while hiding unrelated possessions", () => {
    let branch = node("deep-place");
    for (let i = 0; i < 100; i++) branch = node(`container-${i}`, "item", [branch, node(`possession-${i}`, "item")]);
    let filtered = locationBranches([branch, node("unrelated", "item")]);
    for (let i = 99; i >= 0; i--) {
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe(`container-${i}`);
      filtered = filtered[0]!.children;
    }
    expect(filtered[0]?.id).toBe("deep-place");
    expect(branch.children).toHaveLength(2);
  });
});
