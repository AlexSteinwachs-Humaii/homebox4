import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { maintenanceContextState, useMaintenanceContext } from "./use-maintenance-context";
import type { ItemsApi } from "../lib/api/classes/items";
import type { MaintenanceEntryWithDetails } from "../lib/api/types/data-contracts";
const task = (itemID: string, scheduledDate = "") => ({ itemID, scheduledDate }) as MaintenanceEntryWithDetails;
function setup(get: ReturnType<typeof vi.fn>, records = [task("a"), task("b", "2026-10-12"), task("a")]) {
  const collection = ref<string | null>("first");
  const entries = ref(records);
  const scope = effectScope();
  const tenants: string[] = [];
  const state = scope.run(() =>
    useMaintenanceContext(collection, entries, () => {
      tenants.push(collection.value!);
      return { get } as unknown as ItemsApi;
    })
  )!;
  return { collection, entries, scope, state, tenants };
}
describe("authorized maintenance context", () => {
  it("does not treat an in-flight context load as unavailable", () => {
    expect(maintenanceContextState({}, "tool")).toBe("loading");
    expect(maintenanceContextState({ tool: null }, "tool")).toBe("unavailable");
    expect(maintenanceContextState({ tool: { id: "tool" } }, "tool")).toBe("ready");
    expect(maintenanceContextState({}, "")).toBe("missing");
  });
  it("deduplicates items and derives the panel from the first dated record, not an upcoming rule", async () => {
    const get = vi.fn(async (id: string) => ({
      data: { id, name: id, location: { id: "garage", name: "Real garage" } },
    }));
    const f = setup(get);
    await vi.waitFor(() => expect(Object.keys(f.state.items.value)).toHaveLength(2));
    expect(get).toHaveBeenCalledTimes(2);
    expect(f.state.contextItem.value?.id).toBe("b");
    expect(f.state.contextItem.value?.location?.name).toBe("Real garage");
    f.scope.stop();
  });
  it("keeps denied, missing, mismatched and rejected contexts unavailable", async () => {
    const get = vi.fn().mockResolvedValueOnce({ error: "denied" }).mockRejectedValueOnce(new Error("offline"));
    const f = setup(get);
    await vi.waitFor(() => expect(f.state.items.value).toEqual({ a: null, b: null }));
    get.mockResolvedValue({ data: { id: "wrong" } });
    f.entries.value = [task("c")];
    await vi.waitFor(() => expect(f.state.items.value).toEqual({ c: null }));
    f.scope.stop();
  });
  it("bounds concurrent requests and discards old collection results", async () => {
    const pending: ((v: unknown) => void)[] = [];
    const get = vi.fn(() => new Promise(resolve => pending.push(resolve)));
    const f = setup(
      get,
      Array.from({ length: 10 }, (_, i) => task(String(i)))
    );
    expect(get).toHaveBeenCalledTimes(4);
    f.collection.value = null;
    expect(f.state.items.value).toEqual({});
    pending.forEach(resolve => resolve({ data: { id: "0", name: "Old" } }));
    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(4);
    expect(f.state.items.value).toEqual({});
    get.mockResolvedValue({ data: { id: "new" } });
    f.entries.value = [task("new")];
    f.collection.value = "second";
    await vi.waitFor(() => expect(f.state.contextItem.value?.id).toBe("new"));
    expect(f.tenants).toEqual(["first", "second"]);
    f.scope.stop();
  });
});
