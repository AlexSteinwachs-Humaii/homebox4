<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { useTreeState } from "~~/components/Location/Tree/tree-state";
  import MdiCollapseAllOutline from "~icons/mdi/collapse-all-outline";
  import MdiExpandAllOutline from "~icons/mdi/expand-all-outline";
  import MdiPackageVariant from "~icons/mdi/package-variant";

  import { Button, ButtonGroup } from "@/components/ui/button";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import type { TreeItem } from "~/lib/api/types/data-contracts";
  import BaseContainer from "@/components/Base/Container.vue";
  import BaseSectionHeader from "@/components/Base/SectionHeader.vue";
  import LocationTreeRoot from "~/components/Location/Tree/Root.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import { locationBranches, useLocationOverview } from "~/composables/use-location-overview";

  const { t } = useI18n();

  // TODO: eventually move to https://reka-ui.com/docs/components/tree#draggable-sortable-tree

  definePageMeta({
    middleware: ["auth"],
  });

  useHead({
    title: "HomeBox | " + t("menu.locations"),
  });

  const api = useUserApi();

  const prefs = useViewPreferences();
  const { selectedCollection } = useCollections();
  const collectionId = computed(() => prefs.value.collectionId);
  const { roots, tree, loading, failed, refresh } = useLocationOverview(collectionId, api.items);
  onServerEvent(ServerEvent.EntityMutation, () => void refresh());

  const locationTreeId = "locationTree";
  const showItemsKey = "showItems";

  const treeState = useTreeState(locationTreeId);
  const showItems = ref(true);
  const visibleTree = computed(() => (showItems.value ? tree.value : locationBranches(tree.value)));
  watch(
    collectionId,
    () => {
      treeState.value = {};
    },
    { flush: "sync" }
  );

  const route = useRouter();

  onMounted(() => {
    // set tree state from query params
    const query = route.currentRoute.value.query;

    if (query && query[locationTreeId]) {
      console.debug("setting tree state from query params");
      try {
        const data = JSON.parse(query[locationTreeId] as string);
        for (const key in data) {
          if (typeof data[key] === "boolean") treeState.value[key] = data[key];
        }
      } catch {
        // A malformed saved expansion state must not prevent browsing.
      }
    }

    if (query && query[showItemsKey] !== undefined) {
      showItems.value = query[showItemsKey] === "true";
    }
  });

  watch(
    treeState,
    () => {
      // Push the current state to the URL
      route.replace({
        query: {
          [locationTreeId]: JSON.stringify(treeState.value),
          [showItemsKey]: showItems.value.toString(),
        },
      });
    },
    { deep: true }
  );

  watch(showItems, () => {
    route.replace({
      query: {
        [locationTreeId]: JSON.stringify(treeState.value),
        [showItemsKey]: showItems.value.toString(),
      },
    });
  });

  function closeAll() {
    for (const key in treeState.value) {
      treeState.value[key] = false;
    }
  }

  function openItemChildren(items: TreeItem[]) {
    for (const item of items) {
      if (item.children.length > 0) {
        treeState.value[item.id.replace(/-/g, "").substring(0, 8)] = true;
        openItemChildren(item.children);
      }
    }
  }

  function openAll() {
    if (!tree.value) return;

    openItemChildren(tree.value);
  }
</script>

<template>
  <BaseContainer>
    <div class="mb-2 flex justify-between">
      <BaseSectionHeader>
        {{ $t("menu.locations") }}
        <template #description>{{ $t("locations.overview_description") }}</template>
      </BaseSectionHeader>
      <div>
        <TooltipProvider :delay-duration="0">
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :aria-label="$t('locations.expand_tree')"
                  size="icon"
                  variant="outline"
                  data-pos="start"
                  @click="openAll"
                >
                  <MdiExpandAllOutline />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ $t("locations.expand_tree") }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :aria-label="$t('locations.collapse_tree')"
                  size="icon"
                  variant="outline"
                  data-pos="middle"
                  @click="closeAll"
                >
                  <MdiCollapseAllOutline />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ $t("locations.collapse_tree") }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :aria-label="showItems ? $t('locations.hide_items') : $t('locations.show_items')"
                  :aria-pressed="showItems"
                  size="icon"
                  :variant="showItems ? 'default' : 'outline'"
                  data-pos="end"
                  @click="showItems = !showItems"
                >
                  <MdiPackageVariant />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {{ showItems ? $t("locations.hide_items") : $t("locations.show_items") }}
                </p>
              </TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </TooltipProvider>
      </div>
    </div>
    <p class="mb-5 text-sm text-muted-foreground">
      {{ selectedCollection?.name }}
    </p>
    <BaseCard v-if="loading" class="p-6" role="status">{{ $t("locations.loading") }}</BaseCard>
    <BaseCard v-else-if="failed" class="p-6" role="alert">
      <p>{{ $t("locations.load_failed") }}</p>
      <Button class="mt-3" variant="outline" @click="refresh">{{ $t("locations.retry") }}</Button>
    </BaseCard>
    <div v-else-if="collectionId" class="grid items-start gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <BaseCard class="min-w-0 overflow-x-auto p-4">
        <h2 :id="locationTreeId" class="mb-4 font-serif text-2xl">
          {{ $t("locations.your_spaces") }}
        </h2>
        <LocationTreeRoot :locs="visibleTree" :tree-id="locationTreeId" :show-items="true" />
      </BaseCard>
      <div class="min-w-0 space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <LocationCard v-for="location in roots" :key="location.id" :location="location" overview />
        </div>
        <BaseCard class="p-6">
          <h2 class="mb-2 font-serif text-2xl">
            {{ $t("locations.follow_trail") }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ $t("locations.trail_help") }}
          </p>
        </BaseCard>
        <p v-if="roots.length" class="text-sm text-muted-foreground">
          {{ $t("locations.illustration_help") }}
        </p>
      </div>
    </div>
  </BaseContainer>
</template>
