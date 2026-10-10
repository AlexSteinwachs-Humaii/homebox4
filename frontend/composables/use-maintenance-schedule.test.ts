import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { maintenanceCalendarDate, useMaintenanceSchedule } from "./use-maintenance-schedule";
import type { MaintenanceAPI } from "../lib/api/classes/maintenance";

const result = (data: unknown, error: unknown = null) => ({ data, error });
const task = (id: string, scheduledDate = "2026-10-12") => ({
  id,
  scheduledDate,
  completedDate: "",
});
function setup(getAll = vi.fn().mockResolvedValue(result([]))) {
  const collection = ref<string | null>("a");
  const scope = effectScope();
  const clients: string[] = [];
  const state = scope.run(() =>
    useMaintenanceSchedule(collection, () => {
      clients.push(collection.value!);
      return { getAll } as unknown as MaintenanceAPI;
    })
  )!;
  return { collection, scope, state, getAll, clients };
}

describe("read-only maintenance schedule", () => {
  it("requests only scheduled records and preserves stored ordering, past and missing due dates", async () => {
    const records = [task("undated", ""), task("past", "2000-01-01"), task("future")];
    const f = setup(vi.fn().mockResolvedValue(result(records)));
    expect(f.state.loading.value).toBe(true);
    await vi.waitFor(() => expect(f.state.loading.value).toBe(false));
    expect(f.getAll).toHaveBeenCalledWith({ status: "scheduled" });
    expect(f.state.entries.value).toEqual(records);
    f.scope.stop();
  });

  it("keeps empty responses distinct from explicit errors, missing data and rejected requests", async () => {
    for (const failure of [result([], "denied"), result(undefined), result(null)]) {
      const f = setup(vi.fn().mockResolvedValueOnce(failure).mockResolvedValue(result([])));
      await vi.waitFor(() => expect(f.state.failed.value).toBe(true));
      expect(f.state.entries.value).toEqual([]);
      await f.state.refresh();
      expect(f.state.failed.value).toBe(false);
      expect(f.state.loading.value).toBe(false);
      f.scope.stop();
    }
    const f = setup(vi.fn().mockRejectedValue(new Error("offline")));
    await vi.waitFor(() => expect(f.state.failed.value).toBe(true));
    f.scope.stop();
  });

  it("clears records immediately, resolves fresh tenant clients and ignores late responses", async () => {
    let finish!: (value: unknown) => void;
    const f = setup(
      vi
        .fn()
        .mockResolvedValueOnce(result([task("old")]))
        .mockImplementationOnce(
          () =>
            new Promise(resolve => {
              finish = resolve;
            })
        )
        .mockResolvedValue(result([task("new")]))
    );
    await vi.waitFor(() => expect(f.state.entries.value[0]?.id).toBe("old"));
    f.collection.value = "b";
    expect(f.state.entries.value).toEqual([]);
    expect(f.state.loading.value).toBe(true);
    f.collection.value = "c";
    await vi.waitFor(() => expect(f.state.entries.value[0]?.id).toBe("new"));
    finish(result([task("late")]));
    await Promise.resolve();
    expect(f.state.entries.value[0]?.id).toBe("new");
    expect(f.clients).toEqual(["a", "b", "c"]);
    f.collection.value = null;
    expect(f.state.entries.value).toEqual([]);
    expect(f.state.loading.value).toBe(false);
    expect(f.getAll).toHaveBeenCalledTimes(3);
    f.scope.stop();
  });

  it("ignores late errors and results after disposal", async () => {
    let finish!: (value: unknown) => void;
    const f = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      )
    );
    f.scope.stop();
    finish(result([task("late")], "failed"));
    await Promise.resolve();
    expect(f.state.entries.value).toEqual([]);
    expect(f.state.failed.value).toBe(false);
  });
});

describe("scheduled and completed calendar dates", () => {
  it("retains the exact stored day without converting to an instant", () => {
    for (const date of ["2026-10-12", "2000-01-01", "2024-02-29"]) {
      expect(maintenanceCalendarDate(date)).toBe(date);
    }
  });
  it("labels absent, impossible, zero and unsupported date values as unknown", () => {
    for (const date of [
      null,
      undefined,
      "",
      "0001-01-01",
      "2026-02-30",
      "2025-02-29",
      "invalid",
      "2026-10-12T00:00:00Z",
      new Date(),
    ]) {
      expect(maintenanceCalendarDate(date)).toBeNull();
    }
  });
});
