import type { EntitySummary, EntityTypeSummary, TagOut } from "../api/types/data-contracts";
import { parseDateOnly } from "../datelib/dateOnly";

/** Editable core/purchase state shared by capture and future edit surfaces. No example defaults. */
export interface ItemFormData {
  entityTypeId: string;
  location: EntitySummary | null;
  name: string;
  quantity: number | string;
  description: string;
  tagIds: string[];
  purchasePrice: number | string;
  purchaseDate: string;
  purchaseFrom: string;
  insured: boolean;
}

export function emptyItemForm(): ItemFormData {
  return {
    entityTypeId: "",
    location: null,
    name: "",
    quantity: 1,
    description: "",
    tagIds: [],
    purchasePrice: "",
    purchaseDate: "",
    purchaseFrom: "",
    insured: false,
  };
}

/** Field names are used to resolve localized actionable errors at the UI boundary. */
export function validateItemForm(
  form: ItemFormData,
  options: {
    types: EntityTypeSummary[];
    locations: { id: string }[];
    tags: TagOut[];
  }
): string[] {
  const errors: string[] = [];
  const length = (value: string) => new TextEncoder().encode(value).length;
  if (!options.types.some(type => type.id === form.entityTypeId && !type.isLocation)) errors.push("entityTypeId");
  if (!form.location || !options.locations.some(location => location.id === form.location?.id)) errors.push("location");
  if (!form.name.trim() || length(form.name) > 255) errors.push("name");
  if (form.quantity === "" || !Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 0)
    errors.push("quantity");
  if (length(form.description) > 1000) errors.push("description");
  if (form.tagIds.some(id => !options.tags.some(tag => tag.id === id))) errors.push("tagIds");
  if (form.purchasePrice !== "" && (!Number.isFinite(Number(form.purchasePrice)) || Number(form.purchasePrice) < 0))
    errors.push("purchasePrice");
  if (form.purchaseDate && !parseDateOnly(form.purchaseDate)) errors.push("purchaseDate");
  if (length(form.purchaseFrom) > 255) errors.push("purchaseFrom");
  return errors;
}
