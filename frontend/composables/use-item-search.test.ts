import { afterEach, expect, test, vi } from "vitest";
import { nextTick, ref, watch } from "vue";
import { useItemSearch } from "./use-item-search";
import type { UserClient } from "../lib/api/user";

afterEach(() => vi.unstubAllGlobals());

test("defaults to active and retries changed lifecycle filters while a search is pending", async () => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("watchDebounced", vi.fn());
  let release: () => void = () => {};
  const getAll = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { items: [] }, error: false });
        })
    )
    .mockResolvedValue({ data: { items: [{ id: "offboarded-asset" }] }, error: false });
  const api = { items: { getAll } } as unknown as UserClient;
  const search = useItemSearch(api);
  const pending = search.triggerSearch();
  expect(getAll.mock.calls[0]![0].lifecycle).toBe("active");
  search.lifecycle.value = "offboarded";
  await nextTick();
  release();
  await pending;
  expect(getAll).toHaveBeenCalledTimes(2);
  expect(getAll.mock.calls[1]![0].lifecycle).toBe("offboarded");
  expect(search.results.value).toEqual([{ id: "offboarded-asset" }]);
});
