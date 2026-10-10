<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { useTreeState } from "./tree-state";
  import type { TreeItem } from "~~/lib/api/types/data-contracts";
  import MdiChevronRight from "~icons/mdi/chevron-right";
  import MdiMapMarker from "~icons/mdi/map-marker";
  import MdiPackageVariant from "~icons/mdi/package-variant";
  import LocationTreeNode from "./Node.vue";

  type Props = {
    treeId: string;
    item: TreeItem;
    showItems?: boolean;
  };
  const props = withDefaults(defineProps<Props>(), {
    showItems: true,
  });

  const link = computed(() => {
    return props.item.type === "location" ? `/location/${props.item.id}` : `/item/${props.item.id}`;
  });

  const { t } = useI18n();
  const state = useTreeState(props.treeId);

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  const filteredChildren = computed(() => {
    const children = props.item.children ?? [];

    if (props.showItems) {
      return children;
    }

    return children.filter(child => child.type === "location");
  });

  const sortedChildren = computed(() => {
    return [...filteredChildren.value].sort((a, b) => collator.compare(a.name, b.name));
  });

  const hasChildren = computed(() => filteredChildren.value.length > 0);

  const openRef = computed({
    get() {
      return state.value[props.item.id] ?? false;
    },
    set(value: boolean) {
      state.value[props.item.id] = value;
    },
  });
</script>

<template>
  <div>
    <div class="flex w-max min-w-full items-center gap-1 rounded p-1">
      <div
        class="mr-1 flex items-center justify-center rounded p-0.5"
        :class="{
          'hover:bg-accent hover:text-accent-foreground': hasChildren,
        }"
      >
        <div v-if="!hasChildren" class="size-6" />
        <button
          v-else
          type="button"
          class="group/node relative size-6 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          :data-swap="openRef"
          :aria-expanded="openRef"
          :aria-label="t(openRef ? 'locations.collapse_location' : 'locations.expand_location', { name: item.name })"
          @click="openRef = !openRef"
        >
          <div
            class="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-data-[swap=true]/node:rotate-90"
          >
            <MdiChevronRight class="size-6" aria-hidden="true" />
          </div>
        </button>
      </div>
      <MdiMapMarker v-if="item.type === 'location'" class="size-4 shrink-0" />
      <MdiPackageVariant v-else class="size-4 shrink-0" />
      <NuxtLink class="whitespace-nowrap text-base hover:underline" :to="link" @click.stop>{{ item.name }} </NuxtLink>
    </div>
    <ul v-if="openRef && hasChildren" class="ml-4">
      <li v-for="child in sortedChildren" :key="child.id">
        <LocationTreeNode :item="child" :tree-id="treeId" :show-items="showItems" />
      </li>
    </ul>
  </div>
</template>
