import { onScopeDispose, ref, watch, type Ref } from "vue";
import type { MaintenanceAPI } from "../lib/api/classes/maintenance";
import { MaintenanceFilterStatus, type MaintenanceEntryWithDetails } from "../lib/api/types/data-contracts";
import { parseDateOnly } from "../lib/datelib/dateOnly";

/** The API's types.Date serializes to YYYY-MM-DD or an empty string, never an instant. */
export function maintenanceCalendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !parseDateOnly(value)) return null;
  return value;
}

/** Scheduled = nil/zero completed date, NOT future due date. Preserve repository ordering. */
export function useMaintenanceSchedule(
  collectionId: Ref<string | null | undefined>,
  getApi: () => Pick<MaintenanceAPI, "getAll">
) {
  const entries = ref<MaintenanceEntryWithDetails[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  let generation = 0;

  async function refresh() {
    const request = ++generation;
    entries.value = [];
    failed.value = false;
    loading.value = !!collectionId.value;
    if (!collectionId.value) return;
    try {
      // useUserApi captures X-Tenant at construction; resolve a fresh client after every switch.
      const result = await getApi().getAll({
        status: MaintenanceFilterStatus.MaintenanceFilterStatusScheduled,
      });
      if (request !== generation) return;
      if (result.error || !Array.isArray(result.data)) throw new Error("Maintenance request failed");
      entries.value = result.data;
    } catch {
      if (request === generation) failed.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }

  watch(collectionId, refresh, { immediate: true, flush: "sync" });
  onScopeDispose(() => generation++);
  return { entries, loading, failed, refresh };
}
