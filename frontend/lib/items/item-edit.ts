import type { EntityOut, EntityUpdate } from "../api/types/data-contracts";
import { parseDateOnly } from "../datelib/dateOnly";

export type ItemEditDraft = EntityOut & { tagIds: string[] };

/** A replacement update must include advanced values, not just the visible core form. */
export function editUpdate(draft: ItemEditDraft, id: string, parentId: string | null): EntityUpdate {
  return {
    id,
    parentId,
    entityTypeId: draft.entityType!.id,
    name: draft.name,
    description: draft.description,
    quantity: Number(draft.quantity),
    tagIds: [...draft.tagIds],
    insured: draft.insured,
    archived: draft.archived,
    assetId: draft.assetId,
    fields: draft.fields.map(field => ({ ...field })),
    lifetimeWarranty: draft.lifetimeWarranty,
    manufacturer: draft.manufacturer,
    modelNumber: draft.modelNumber,
    notes: draft.notes,
    serialNumber: draft.serialNumber,
    purchasePrice: draft.purchasePrice == null || String(draft.purchasePrice) === "" ? 0 : Number(draft.purchasePrice),
    purchaseDate: draft.purchaseDate,
    purchaseFrom: draft.purchaseFrom,
    soldPrice: draft.soldPrice == null || String(draft.soldPrice) === "" ? 0 : Number(draft.soldPrice),
    soldDate: draft.soldDate,
    soldNotes: draft.soldNotes,
    soldTo: draft.soldTo,
    syncChildEntityLocations: draft.syncChildEntityLocations,
    warrantyDetails: draft.warrantyDetails,
    warrantyExpires: draft.warrantyExpires,
  };
}

/** Match supported form constraints; collection/reference authorization remains server-side. */
export function validateEdit(draft: ItemEditDraft, parentId: string | null): string[] {
  const errors: string[] = [];
  const length = (value: string) => new TextEncoder().encode(value || "").length;
  if (!draft.name?.trim() || length(draft.name) > 255) errors.push("name");
  if (!draft.entityType?.id) errors.push("entityTypeId");
  // Root locations are valid; possessions require an actual parent (item or location).
  if (!parentId && !draft.entityType?.isLocation) errors.push("location");
  for (const [field, max] of [
    ["description", 1000],
    ["purchaseFrom", 255],
    ["soldTo", 255],
  ] as const) {
    if (length(draft[field]) > max) errors.push(field);
  }
  for (const field of ["quantity", "purchasePrice", "soldPrice"] as const) {
    const value = draft[field];
    if (
      (field === "quantity" && (value == null || String(value) === "")) ||
      (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))
    )
      errors.push(field);
  }
  for (const field of ["purchaseDate", "soldDate", "warrantyExpires"] as const) {
    if (draft[field] && !parseDateOnly(String(draft[field]))) errors.push(field);
  }
  return errors;
}
