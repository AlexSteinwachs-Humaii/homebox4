import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { scopedResource } from "./scoped-resource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(load: () => Promise<number[]>, id: string | null = "a") {
  const scope = effectScope();
  const collection = ref<string | null>(id);
  const resource = scope.run(() => scopedResource(collection, load))!;
  return { scope, collection, resource };
}

describe("collection-scoped overview requests", () => {
  it("distinguishes pending, a successful empty response, failure, and retry", async () => {
    const first = deferred<number[]>();
    const load = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([3]);
    const { resource, scope } = setup(load);
    expect(resource.pending.value).toBe(true);
    expect(resource.data.value).toBeNull();
    first.resolve([]);
    await first.promise;
    expect(resource.data.value).toEqual([]);
    expect(resource.pending.value).toBe(false);
    await resource.refresh();
    expect(resource.error.value).toBe(true);
    expect(resource.data.value).toBeNull();
    await resource.refresh();
    expect(resource.error.value).toBe(false);
    expect(resource.data.value).toEqual([3]);
    scope.stop();
  });

  it("clears old collection data synchronously and ignores late responses from previous collections", async () => {
    const a = deferred<number[]>();
    const b = deferred<number[]>();
    const { resource, collection, scope } = setup(
      vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    );
    collection.value = "b";
    expect(resource.data.value).toBeNull();
    b.resolve([2]);
    await b.promise;
    a.resolve([1]);
    await a.promise;
    expect(resource.data.value).toEqual([2]);
    scope.stop();
  });

  it("does not issue unscoped requests, and clears data when selection is removed", async () => {
    const load = vi.fn().mockResolvedValue([1]);
    const { resource, collection, scope } = setup(load, null);
    expect(load).not.toHaveBeenCalled();
    collection.value = "a";
    await resource.refresh();
    expect(resource.data.value).toEqual([1]);
    collection.value = null;
    expect(resource.data.value).toBeNull();
    expect(resource.pending.value).toBe(false);
    scope.stop();
  });

  it("mutation refresh clears prior totals and an older failed request cannot overwrite the latest success", async () => {
    const old = deferred<number[]>();
    const { resource, scope } = setup(vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([5]));
    await resource.refresh();
    old.reject(new Error("old failure"));
    await old.promise.catch(() => {});
    expect(resource.data.value).toEqual([5]);
    expect(resource.error.value).toBe(false);
    scope.stop();
  });

  it("does not publish responses after the page is disposed", async () => {
    const request = deferred<number[]>();
    const { resource, scope } = setup(() => request.promise);
    scope.stop();
    request.resolve([1]);
    await request.promise;
    expect(resource.data.value).toBeNull();
  });
});
