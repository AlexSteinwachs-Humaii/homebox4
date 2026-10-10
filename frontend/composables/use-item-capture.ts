import { onScopeDispose, ref, shallowRef, watch, type Ref } from "vue";
import type { ItemsApi } from "../lib/api/classes/items";
import type { EntityOut, EntityUpdate } from "../lib/api/types/data-contracts";
import { validateItemForm, type ItemFormData } from "../lib/items/item-form";

import { creationReceipt } from "../lib/items/creation-receipt";

type Options = Parameters<typeof validateItemForm>[1];
export type CaptureStage = "idle" | "invalid" | "create_failed" | "uncertain" | "partial" | "saved";

/** EntityUpdate is a replacement: preserve all non-form values returned by creation. */
export function captureUpdate(entity: EntityOut, form: ItemFormData): EntityUpdate {
  return {
    id: entity.id,
    entityTypeId: form.entityTypeId,
    parentId: form.location!.id,
    name: form.name,
    description: form.description,
    quantity: Number(form.quantity),
    tagIds: [...form.tagIds],
    insured: form.insured,
    // EntityUpdate.purchasePrice is a float64. JSON null is rejected, so a blank optional price is stored as 0, matching the existing edit form.
    purchasePrice: form.purchasePrice === "" || form.purchasePrice == null ? 0 : Number(form.purchasePrice),
    purchaseDate: form.purchaseDate || entity.purchaseDate,
    purchaseFrom: form.purchaseFrom,
    archived: entity.archived,
    assetId: entity.assetId,
    fields: entity.fields,
    lifetimeWarranty: entity.lifetimeWarranty,
    manufacturer: entity.manufacturer,
    modelNumber: entity.modelNumber,
    notes: entity.notes,
    serialNumber: entity.serialNumber,
    soldDate: entity.soldDate,
    soldNotes: entity.soldNotes,
    soldPrice: entity.soldPrice,
    soldTo: entity.soldTo,
    syncChildEntityLocations: entity.syncChildEntityLocations,
    warrantyDetails: entity.warrantyDetails,
    warrantyExpires: entity.warrantyExpires,
  };
}

export function useItemCapture(
  collectionId: Ref<string | null | undefined>,
  getApi: () => Pick<ItemsApi, "create" | "update">
) {
  const pending = ref(false);
  const stage = ref<CaptureStage>("idle");
  const entity = shallowRef<EntityOut | null>(null);
  const errors = ref<string[]>([]);
  const status = ref<number | null>(null);
  let generation = 0;
  watch(
    collectionId,
    () => {
      generation++;
      creationReceipt.clear();
      pending.value = false;
      stage.value = "idle";
      entity.value = null;
      errors.value = [];
      status.value = null;
    },
    { flush: "sync" }
  );
  onScopeDispose(() => generation++);

  async function save(input: ItemFormData, options: Options): Promise<string | null> {
    if (pending.value || !collectionId.value || stage.value === "uncertain" || stage.value === "saved") return null;
    creationReceipt.clear();
    const tenant = collectionId.value;
    errors.value = validateItemForm(input, options);
    if (errors.value.length) {
      stage.value = entity.value ? "partial" : "invalid";
      return null;
    }
    // Freeze a submission while controls are disabled; retries use the still-retained editable input.
    const form = { ...input, tagIds: [...input.tagIds] };
    const request = generation;
    const current = () => request === generation;
    const api = getApi(); // A single tenant-bound client for both requests.
    pending.value = true;
    status.value = null;
    try {
      if (!entity.value) {
        try {
          const result = await api.create({
            name: form.name,
            description: form.description,
            quantity: Number(form.quantity),
            entityTypeId: form.entityTypeId,
            parentId: form.location!.id,
            tagIds: form.tagIds,
          });
          if (!current()) return null;
          if (result.error) {
            status.value = result.status;
            // Only explicit client rejections are safe to resubmit. A server/gateway error can follow a committed write.
            stage.value = [400, 401, 403, 404, 409, 422, 429].includes(result.status) ? "create_failed" : "uncertain";
            return null;
          }
          if (!result.data?.id) {
            stage.value = "uncertain";
            return null;
          }
          entity.value = result.data;
        } catch {
          if (current()) stage.value = "uncertain";
          return null;
        }
      }
      stage.value = "partial";
      try {
        const result = await api.update(entity.value!.id, captureUpdate(entity.value!, form));
        if (!current()) return null;
        if (result.error || result.data?.id !== entity.value!.id) {
          status.value = result.status;
          return null;
        }
        entity.value = result.data;
        stage.value = "saved";
        creationReceipt.publish(tenant, entity.value!.id);
        return entity.value!.id;
      } catch {
        // PUT targets a known identity and can safely be retried, unlike POST.
        return null;
      }
    } finally {
      if (current()) pending.value = false;
    }
  }
  return { save, pending, stage, entity, errors, status };
}
