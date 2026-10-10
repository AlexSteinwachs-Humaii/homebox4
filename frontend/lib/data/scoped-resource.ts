import { onScopeDispose, shallowRef, watch, type Ref } from "vue";

/** Clear data before each load; only the latest request in the current tenant may publish. */
export function scopedResource<T>(collectionId: Ref<string | null | undefined>, load: () => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const pending = shallowRef(false);
  const error = shallowRef(false);
  let generation = 0;

  async function refresh() {
    const request = ++generation;
    data.value = null;
    error.value = false;
    pending.value = !!collectionId.value;
    if (!collectionId.value) return;
    try {
      const result = await load();
      if (request === generation) data.value = result;
    } catch {
      if (request === generation) error.value = true;
    } finally {
      if (request === generation) pending.value = false;
    }
  }

  watch(collectionId, () => void refresh(), { immediate: true, flush: "sync" });
  onScopeDispose(() => generation++);
  return { data, pending, error, refresh };
}
