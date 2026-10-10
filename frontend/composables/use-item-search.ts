import type { EntitySummary, TagSummary } from "~~/lib/api/types/data-contracts";
import type { UserClient } from "~~/lib/api/user";

type SearchOptions = {
  immediate?: boolean;
};

export function useItemSearch(client: UserClient, opts?: SearchOptions) {
  const query = ref("");
  const locations = ref<EntitySummary[]>([]);
  const tags = ref<TagSummary[]>([]);
  const results = ref<EntitySummary[]>([]);
  const includeArchived = ref(false);
  const lifecycle = ref<"active" | "all" | "offboarded">("active");
  watch([lifecycle, includeArchived], () => {
    void triggerSearch();
  });
  const isLoading = ref(false);
  const pendingSearch = ref(false);

  watchDebounced(query, search, { debounce: 250, maxWait: 1000 });
  async function search(): Promise<boolean> {
    if (isLoading.value) {
      // Retry with the latest query AND filters after the current request.
      pendingSearch.value = true;
      return false;
    }

    const searchQuery = query.value;
    isLoading.value = true;
    try {
      const locIds = locations.value.map(l => l.id);
      const tagIds = tags.value.map(t => t.id);

      const { data, error } = await client.items.getAll({
        q: searchQuery,
        parentIds: locIds,
        tags: tagIds,
        includeArchived: includeArchived.value,
        lifecycle: lifecycle.value,
      });

      if (error || !data) {
        console.error("useItemSearch.search error:", error);
        return false;
      }

      results.value = data.items ?? [];
      return true;
    } finally {
      isLoading.value = false;

      if (pendingSearch.value) {
        pendingSearch.value = false;
        await nextTick();
        await search();
      }
    }
  }

  async function triggerSearch(): Promise<boolean> {
    try {
      return await search();
    } catch (err) {
      console.error("triggerSearch error:", err);
      return false;
    }
  }

  if (opts?.immediate) {
    search()
      .then(success => {
        if (!success) {
          console.error("Initial search failed");
        }
      })
      .catch(err => {
        console.error("Initial search error:", err);
      });
  }

  return {
    query,
    results,
    locations,
    tags,
    includeArchived,
    lifecycle,
    isLoading,
    triggerSearch,
  };
}
