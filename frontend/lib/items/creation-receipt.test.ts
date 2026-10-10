import { describe, expect, it } from "vitest";
import { createReceiptStore } from "./creation-receipt";

describe("creation feedback receipt", () => {
  it("matches the collection and real identity once only", () => {
    const store = createReceiptStore();
    store.publish("home", "lamp");
    expect(store.take("home", "lamp")).toBe(true);
    expect(store.take("home", "lamp")).toBe(false);
  });

  it.each([
    ["other", "lamp"],
    ["home", "other"],
    [null, "lamp"],
  ])("discards receipts on a mismatched destination (%s, %s)", (collection, id) => {
    const store = createReceiptStore();
    store.publish("home", "lamp");
    expect(store.take(collection, id!)).toBe(false);
    expect(store.take("home", "lamp")).toBe(false);
  });

  it("does not survive a reload/new store or explicit invalidation", () => {
    const store = createReceiptStore();
    store.publish("home", "lamp");
    expect(createReceiptStore().take("home", "lamp")).toBe(false);
    store.clear();
    expect(store.take("home", "lamp")).toBe(false);
  });
});
