import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { editUpdate, validateEdit, type ItemEditDraft } from "./item-edit";

const draft = () =>
  ({
    id: "original",
    entityType: { id: "item-type", isLocation: false },
    name: "Camera",
    quantity: 2.5,
    description: "Description",
    parent: { id: "case" },
    location: { id: "garage" },
    fields: [{ id: "custom", name: "Lens", type: "text", textValue: "35mm" }],
    tagIds: ["tag"],
    insured: true,
    archived: true,
    assetId: "123-456",
    manufacturer: "Maker",
    modelNumber: "Model",
    serialNumber: "Serial",
    notes: "Notes",
    purchasePrice: 42.5,
    purchaseFrom: "Shop",
    purchaseDate: "2026-02-03",
    soldPrice: 17,
    soldDate: "2026-08-01",
    soldTo: "Buyer",
    soldNotes: "Sale notes",
    warrantyExpires: "2027-01-01",
    warrantyDetails: "Warranty",
    lifetimeWarranty: false,
    syncChildEntityLocations: false,
    attachments: [{ id: "receipt" }],
  }) as ItemEditDraft;

describe("edit replacement updates", () => {
  it("preserves every unrelated update field and actual parent, omitting read-only edges", () => {
    const original = draft();
    const changed = reactive(draft());
    changed.name = "Edited";
    const payload = editUpdate(changed, "original", "case");
    expect(payload).toMatchObject({ id: "original", name: "Edited", parentId: "case", entityTypeId: "item-type" });
    for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
      if (["id", "name", "parentId", "entityTypeId"].includes(key)) continue;
      expect(payload[key]).toEqual(original[key as keyof ItemEditDraft]);
    }
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).not.toHaveProperty("location");
    payload.fields[0]!.textValue = "changed snapshot";
    payload.tagIds.push("another");
    expect(changed.fields[0]!.textValue).toBe("35mm");
    expect(changed.tagIds).toEqual(["tag"]);
  });

  it("fixes identity to the loaded record and only uses explicit parent/type changes", () => {
    const changed = draft();
    changed.id = "different";
    changed.entityType!.id = "selected-type";
    expect(editUpdate(changed, "original", "selected-location")).toMatchObject({
      id: "original",
      parentId: "selected-location",
      entityTypeId: "selected-type",
    });
  });

  it("normalizes blank prices without mutating the draft, retaining zero/fractional values", () => {
    // Exercise defensive handling of a legacy/null response despite generated non-null output types.
    const changed = { ...draft(), purchasePrice: null, soldPrice: null } as unknown as ItemEditDraft;
    const payload = editUpdate(changed, "original", "case");
    expect(payload.purchasePrice).toBe(0);
    expect(payload.soldPrice).toBe(0);
    expect(payload.quantity).toBe(2.5);
    expect(changed.purchasePrice).toBeNull();
  });

  it("validates supported constraints including dates and root-location parent rules", () => {
    expect(validateEdit(draft(), "case")).toEqual([]);
    const invalid = draft();
    invalid.name = " ";
    invalid.quantity = -1;
    invalid.purchasePrice = Infinity;
    invalid.purchaseDate = "2026-02-30";
    invalid.description = "x".repeat(1001);
    expect(validateEdit(invalid, null)).toEqual([
      "name",
      "location",
      "description",
      "quantity",
      "purchasePrice",
      "purchaseDate",
    ]);
    const root = draft();
    root.entityType!.isLocation = true;
    expect(validateEdit(root, null)).toEqual([]);
  });
});
