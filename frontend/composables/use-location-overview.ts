import { ref, watch, onScopeDispose, type Ref } from "vue";
import type { ItemsApi } from "../lib/api/classes/items";
import type { EntitySummary, TreeItem } from "../lib/api/types/data-contracts";

/** Keep item containers needed to reach places, rather than moving places to invented parents. */
export function locationBranches(items: TreeItem[]): TreeItem[] {
  return items.flatMap(item => {
    const children = locationBranches(item.children ?? []);
    return item.type === "location" || children.length ? [{ ...item, children }] : [];
  });
}

export function useLocationOverview(collectionId: Ref<string | null | undefined>, api: ItemsApi) {
  const roots = ref<EntitySummary[]>([]);
  const tree = ref<TreeItem[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  let generation = 0;

  async function refresh() {
    const request = ++generation;
    roots.value = [];
    tree.value = [];
    failed.value = false;
    loading.value = !!collectionId.value;
    if (!collectionId.value) return;
    try {
      const [places, hierarchy] = await Promise.all([
        api.getLocations({ filterChildren: true }),
        api.getTree({ withItems: true }),
      ]);
      if (request !== generation) return;
      if (places.error || hierarchy.error) throw new Error("Locations request failed");
      // The API queries EntityType.isLocation; do not classify entities by their names.
      roots.value = places.data;
      tree.value = hierarchy.data;
    } catch {
      if (request === generation) failed.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }

  watch(collectionId, refresh, { immediate: true, flush: "sync" });
  onScopeDispose(() => generation++);
  return { roots, tree, loading, failed, refresh };
}
