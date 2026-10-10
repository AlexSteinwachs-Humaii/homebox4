import { ref, watch, onScopeDispose, type Ref } from "vue";
import type { ItemsApi } from "../lib/api/classes/items";
import type { EntityOut, EntityPath, EntitySummary } from "../lib/api/types/data-contracts";

/** Direct-child pagination. Resolve the tenant-bound client anew on every request. */
export function useLocationContents(
  collectionId: Ref<string | null | undefined>,
  locationId: Ref<string>,
  pageSize: Ref<number>,
  api: () => ItemsApi
) {
  const location = ref<EntityOut>();
  const items = ref<EntitySummary[]>([]);
  const fullpath = ref<EntityPath[]>([]);
  const total = ref(0);
  const page = ref(1);
  const loading = ref(false);
  const failed = ref(false);
  const unavailable = ref(false);
  let generation = 0;

  async function refresh() {
    const request = ++generation;
    location.value = undefined;
    items.value = [];
    fullpath.value = [];
    total.value = 0;
    failed.value = false;
    unavailable.value = false;
    loading.value = !!collectionId.value;
    if (!collectionId.value) return;
    try {
      const client = api();
      const id = locationId.value;
      const record = await client.getLocation(id);
      if (request !== generation) return;
      if (record.error || !record.data?.entityType?.isLocation) {
        unavailable.value = true;
        return;
      }
      const [contents, path] = await Promise.all([
        client.getAll({
          parentIds: [id],
          page: page.value,
          pageSize: pageSize.value,
        }),
        client.fullpath(id),
      ]);
      if (request !== generation) return;
      if (contents.error || path.error) throw new Error("Location contents unavailable");
      // If records were deleted while on the last page, request the new last page.
      const lastPage = Math.max(1, Math.ceil(contents.data.total / pageSize.value));
      if (page.value > lastPage) {
        page.value = lastPage;
        return;
      }
      location.value = record.data;
      items.value = contents.data.items;
      fullpath.value = path.data;
      total.value = contents.data.total;
    } catch {
      if (request === generation) failed.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }

  watch(
    [collectionId, locationId, pageSize],
    () => {
      if (page.value !== 1) page.value = 1;
      else void refresh();
    },
    { immediate: true, flush: "sync" }
  );
  watch(page, () => void refresh(), { flush: "sync" });
  onScopeDispose(() => generation++);
  return {
    location,
    items,
    fullpath,
    total,
    page,
    loading,
    failed,
    unavailable,
    refresh,
  };
}
