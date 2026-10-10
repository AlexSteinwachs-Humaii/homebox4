import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { captureUpdate, useItemCapture } from "./use-item-capture";
import { creationReceipt } from "../lib/items/creation-receipt";
import { emptyItemForm } from "../lib/items/item-form";
import type { EntityOut, EntitySummary, EntityTypeSummary, TagOut } from "../lib/api/types/data-contracts";
import type { ItemsApi } from "../lib/api/classes/items";

const record = {
  id: "real-id",
  entityType: { id: "type" },
  parent: { id: "place" },
  name: "Lamp",
  description: "",
  quantity: 1,
  tags: [{ id: "tag" }],
  insured: false,
  archived: false,
  assetId: "123",
  fields: [],
  lifetimeWarranty: true,
  manufacturer: "Maker",
  modelNumber: "Model",
  notes: "preserve",
  serialNumber: "serial",
  purchaseDate: "0001-01-01",
  purchaseFrom: "",
  purchasePrice: 0,
  soldDate: "0001-01-01",
  soldNotes: "",
  soldPrice: 0,
  soldTo: "",
  syncChildEntityLocations: false,
  warrantyDetails: "warranty",
  warrantyExpires: "0001-01-01",
  attachments: [],
  children: [],
  createdAt: "2026-10-09",
  updatedAt: "2026-10-09",
  itemCount: 0,
  totalPrice: 0,
} as unknown as EntityOut;
const options = {
  types: [{ id: "type", isLocation: false }] as EntityTypeSummary[],
  locations: [{ id: "place" }],
  tags: [{ id: "tag" }] as TagOut[],
};
const form = () => ({
  ...emptyItemForm(),
  name: "Lamp",
  entityTypeId: "type",
  location: { id: "place" } as EntitySummary,
  tagIds: ["tag"],
  quantity: "2.5",
  purchasePrice: "0",
  purchaseDate: "2026-10-09",
  purchaseFrom: "Shop",
  insured: true,
});
function response(error = false, status = error ? 400 : 200, data = record) {
  return { error, status, data, response: new Response(null, { status }) };
}
function setup() {
  creationReceipt.clear();
  const scope = effectScope();
  const collection = ref<string | null>("tenant");
  const create = vi.fn<ItemsApi["create"]>().mockResolvedValue(response());
  const update = vi.fn<ItemsApi["update"]>().mockResolvedValue(response());
  const capture = scope.run(() => useItemCapture(collection, () => ({ create, update })))!;
  return { capture, create, update, collection, scope };
}

describe("item capture persistence", () => {
  it("creates selected core fields once, then saves complete purchase data with its actual identity", async () => {
    const { capture, create, update, scope } = setup();
    const input = form();
    expect(await capture.save(input, options)).toBe("real-id");
    expect(create).toHaveBeenCalledWith({
      name: "Lamp",
      description: "",
      quantity: 2.5,
      entityTypeId: "type",
      parentId: "place",
      tagIds: ["tag"],
    });
    expect(update).toHaveBeenCalledWith(
      "real-id",
      expect.objectContaining({
        id: "real-id",
        purchasePrice: 0,
        purchaseDate: "2026-10-09",
        purchaseFrom: "Shop",
        insured: true,
        assetId: "123",
        notes: "preserve",
        manufacturer: "Maker",
        lifetimeWarranty: true,
      })
    );
    expect(capture.stage.value).toBe("saved");
    expect(creationReceipt.take("tenant", "real-id")).toBe(true);
    expect(creationReceipt.take("tenant", "real-id")).toBe(false);
    await capture.save(input, options);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("preserves non-form fields and handles blank optional values and false insured", () => {
    const input = form();
    input.purchasePrice = "";
    input.purchaseDate = "";
    input.purchaseFrom = "";
    input.insured = false;
    const payload = captureUpdate(record, input);
    expect(payload.purchasePrice).toBe(0);
    expect(payload.purchaseDate).toBe(record.purchaseDate);
    expect(payload.purchaseFrom).toBe("");
    expect(payload.insured).toBe(false);
    expect(payload.fields).toEqual(record.fields);
    expect(payload.warrantyDetails).toBe("warranty");
    expect(payload.parentId).toBe("place");
  });

  it("retains input and identity after update rejection; retries only PUT with corrected entries", async () => {
    const { capture, create, update, scope } = setup();
    const input = form();
    update.mockResolvedValueOnce(response(true));
    expect(await capture.save(input, options)).toBeNull();
    expect(capture.entity.value?.id).toBe("real-id");
    expect(capture.stage.value).toBe("partial");
    expect(creationReceipt.take("tenant", "real-id")).toBe(false);
    expect(input).toEqual(form());
    input.purchaseFrom = "Corrected shop";
    input.name = "Corrected name";
    expect(await capture.save(input, options)).toBe("real-id");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(
      "real-id",
      expect.objectContaining({
        purchaseFrom: "Corrected shop",
        name: "Corrected name",
      })
    );
    scope.stop();
  });

  it("retries a transport-failed update without recreating", async () => {
    const { capture, create, update, scope } = setup();
    update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await capture.save(form(), options);
    expect(capture.stage.value).toBe("partial");
    expect(await capture.save(form(), options)).toBe("real-id");
    expect(create).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("does not report complete success when PUT returns no matching identity", async () => {
    const { capture, create, update, scope } = setup();
    update.mockResolvedValueOnce(response(false, 200, {} as EntityOut));
    expect(await capture.save(form(), options)).toBeNull();
    expect(capture.stage.value).toBe("partial");
    expect(capture.entity.value?.id).toBe("real-id");
    expect(await capture.save(form(), options)).toBe("real-id");
    expect(create).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("guards concurrent submit and waits for update before success", async () => {
    const { capture, create, update, scope } = setup();
    let finish!: (value: ReturnType<typeof response>) => void;
    update.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const saving = capture.save(form(), options);
    await Promise.resolve();
    expect(capture.pending.value).toBe(true);
    expect(capture.stage.value).toBe("partial");
    expect(creationReceipt.take("tenant", "real-id")).toBe(false);
    expect(await capture.save(form(), options)).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    finish(response());
    expect(await saving).toBe("real-id");
    scope.stop();
  });

  it("keeps validation failures local and explicit create rejections retryable", async () => {
    const { capture, create, update, scope } = setup();
    const input = form();
    input.name = "";
    await capture.save(input, options);
    expect(capture.errors.value).toContain("name");
    expect(create).not.toHaveBeenCalled();
    input.name = "Lamp";
    create.mockResolvedValueOnce(response(true, 422));
    await capture.save(input, options);
    expect(capture.stage.value).toBe("create_failed");
    expect(creationReceipt.take("tenant", "real-id")).toBe(false);
    expect(input).toEqual(form());
    expect(update).not.toHaveBeenCalled();
    expect(await capture.save(input, options)).toBe("real-id");
    scope.stop();
  });

  it.each(["transport", "server", "missing-id"])("blocks duplicate POST after uncertain %s outcome", async kind => {
    const { capture, create, update, scope } = setup();
    if (kind === "transport") create.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    if (kind === "server") create.mockResolvedValueOnce(response(true, 500));
    if (kind === "missing-id") create.mockResolvedValueOnce(response(false, 201, {} as EntityOut));
    const input = form();
    await capture.save(input, options);
    expect(capture.stage.value).toBe("uncertain");
    expect(creationReceipt.take("tenant", "real-id")).toBe(false);
    expect(input).toEqual(form());
    await capture.save(input, options);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    scope.stop();
  });

  it("clears identity on collection change and ignores a stale create response", async () => {
    const { capture, create, update, collection, scope } = setup();
    let finish!: (value: ReturnType<typeof response>) => void;
    create.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const saving = capture.save(form(), options);
    collection.value = "other";
    finish(response());
    expect(await saving).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(capture.entity.value).toBeNull();
    expect(capture.stage.value).toBe("idle");
    scope.stop();
  });

  it("ignores completion of an update after switching collections", async () => {
    const { capture, update, collection, scope } = setup();
    let finish!: (value: ReturnType<typeof response>) => void;
    update.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const saving = capture.save(form(), options);
    await Promise.resolve();
    collection.value = "other";
    finish(response());
    expect(await saving).toBeNull();
    expect(capture.stage.value).toBe("idle");
    expect(capture.entity.value).toBeNull();
    scope.stop();
  });

  it.each(["entityTypeId", "location", "tagIds"])(
    "rejects unauthorized %s before any write, including partial retry",
    async field => {
      const { capture, create, update, scope } = setup();
      const input = form();
      if (field === "entityTypeId") input.entityTypeId = "foreign-type";
      if (field === "location") input.location = { id: "foreign-place" } as EntitySummary;
      if (field === "tagIds") input.tagIds = ["foreign-tag"];
      const original = structuredClone(input);
      await capture.save(input, options);
      expect(capture.errors.value).toContain(field);
      expect(input).toEqual(original);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      update.mockResolvedValueOnce(response(true));
      await capture.save(form(), options);
      expect(capture.stage.value).toBe("partial");
      await capture.save(input, options);
      expect(capture.errors.value).toContain(field);
      expect(create).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
      expect(capture.entity.value?.id).toBe("real-id");
      scope.stop();
    }
  );

  it("cannot reuse a partial identity in another tenant", async () => {
    const { capture, create, update, collection, scope } = setup();
    update.mockResolvedValueOnce(response(true));
    await capture.save(form(), options);
    expect(capture.entity.value?.id).toBe("real-id");
    collection.value = "other";
    expect(capture.entity.value).toBeNull();
    await capture.save(form(), options);
    expect(create).toHaveBeenCalledTimes(2);
    scope.stop();
  });
});
