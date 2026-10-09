import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import { downloadCSV, useCSVExport } from "./use-csv-export";

const file = { blob: new Blob(["Name\n"], { type: "text/csv" }), filename: "filtered-report.csv" };

describe("CSV export lifecycle", () => {
  it("blocks duplicates, downloads header-only output and resets loading", async () => {
    const scope = effectScope();
    const save = vi.fn();
    const state = scope.run(() => useCSVExport(save))!;
    let resolve!: (value: typeof file) => void;
    const request = vi.fn(
      () =>
        new Promise<typeof file>(r => {
          resolve = r;
        })
    );
    const pending = state.run(request);
    expect(state.loading.value).toBe(true);
    await state.run(request);
    expect(request).toHaveBeenCalledTimes(1);
    resolve(file);
    await pending;
    expect(save).toHaveBeenCalledWith(file);
    expect(state.loading.value).toBe(false);
    expect(state.failed.value).toBe(false);
    scope.stop();
  });

  it("shows failure without downloading and permits retry", async () => {
    const scope = effectScope();
    const save = vi.fn();
    const state = scope.run(() => useCSVExport(save))!;
    await state.run(() => Promise.reject(new Error("Network failure")));
    expect(state.failed.value).toBe(true);
    expect(state.loading.value).toBe(false);
    expect(save).not.toHaveBeenCalled();
    await state.run(async () => file);
    expect(save).toHaveBeenCalledOnce();
    expect(state.failed.value).toBe(false);
    scope.stop();
  });

  it("aborts on navigation and ignores late responses", async () => {
    const scope = effectScope();
    const save = vi.fn();
    const state = scope.run(() => useCSVExport(save))!;
    let signal!: AbortSignal;
    let resolve!: (value: typeof file) => void;
    const pending = state.run(s => {
      signal = s;
      return new Promise(r => {
        resolve = r;
      });
    });
    scope.stop();
    expect(signal.aborted).toBe(true);
    expect(state.loading.value).toBe(false);
    resolve(file);
    await pending;
    expect(save).not.toHaveBeenCalled();
    expect(state.failed.value).toBe(false);
  });

  it.each([false, true])("cleans up anchor and object URL when click throws: %s", throws => {
    const remove = vi.fn();
    const anchor = {
      href: "",
      download: "",
      remove,
      click: vi.fn(() => {
        if (throws) throw new Error("click");
      }),
    };
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
    try {
      if (throws) expect(() => downloadCSV(file)).toThrow("click");
      else downloadCSV(file);
      expect(anchor.download).toBe(file.filename);
      expect(remove).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith("blob:report");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
