import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { ItemsApi } from "../lib/api/classes/items";
import type { EntityOut, MaintenanceEntryWithDetails } from "../lib/api/types/data-contracts";
import { maintenanceCalendarDate } from "./use-maintenance-schedule";

/** Context is collection-scoped, deduplicated, and loaded independently of schedule availability. */
export function useMaintenanceContext(
  collectionId: Ref<string | null | undefined>,
  entries: Ref<MaintenanceEntryWithDetails[]>,
  getApi: () => Pick<ItemsApi, "get">
) {
  const items = ref<Record<string, EntityOut | null>>({});
  let generation = 0;
  watch(
    [collectionId, entries],
    async () => {
      const request = ++generation;
      items.value = {};
      if (!collectionId.value) return;
      const ids = [...new Set(entries.value.map(entry => entry.itemID).filter(Boolean))];
      const api = getApi(); // Capture this collection's authorized client before any await.
      let cursor = 0;
      async function worker() {
        while (request === generation && cursor < ids.length) {
          const id = ids[cursor++]!;
          let item: EntityOut | null = null;
          try {
            const result = await api.get(id);
            if (!result.error && result.data?.id === id) item = result.data;
          } catch {
            // A missing/denied context must never hide authorized schedule records.
          }
          if (request === generation) items.value = { ...items.value, [id]: item };
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
    },
    { immediate: true, flush: "sync" }
  );
  onScopeDispose(() => generation++);
  const contextEntry = computed(
    () => entries.value.find(entry => maintenanceCalendarDate(entry.scheduledDate)) ?? entries.value[0]
  );
  const contextItem = computed(() => items.value[contextEntry.value?.itemID ?? ""]);
  return { items, contextEntry, contextItem };
}
