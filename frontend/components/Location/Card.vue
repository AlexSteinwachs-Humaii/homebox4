<template>
  <Card v-if="overview" class="overflow-hidden">
    <NuxtLink
      :to="`/location/${location.id}`"
      :aria-label="$t('locations.open_location', { name: location.name })"
      class="block transition hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div class="flex h-44 items-center justify-center bg-muted" aria-hidden="true">
        <MdiMapMarkerOutline class="size-20 text-muted-foreground" />
      </div>
      <div class="space-y-3 p-5">
        <h2 class="break-words font-serif text-2xl">{{ location.name }}</h2>
        <p v-if="location.description" class="break-words text-sm text-muted-foreground">
          {{ location.description }}
        </p>
        <p class="text-sm text-primary">{{ $t("locations.open_location", { name: location.name }) }} →</p>
      </div>
    </NuxtLink>
  </Card>
  <Card v-else>
    <NuxtLink :to="`/location/${location.id}`" class="group/location-card transition duration-300">
      <div
        :class="{
          'p-4': !dense,
          'px-3 py-2': dense,
        }"
      >
        <h2 class="flex items-center justify-between gap-2">
          <div class="relative size-6">
            <div
              class="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover/location-card:-rotate-90"
            >
              <MdiMapMarkerOutline class="size-6 group-hover/location-card:hidden" />
              <MdiArrowUp class="hidden size-6 group-hover/location-card:block" />
            </div>
          </div>
          <span class="mx-auto">
            {{ location.name }}
          </span>
          <Badge :class="{ 'opacity-0': !hasCount }">
            {{ count }}
          </Badge>
        </h2>
      </div>
    </NuxtLink>
  </Card>
</template>

<script lang="ts" setup>
  import type { EntityOut, EntitySummary } from "~~/lib/api/types/data-contracts";
  import MdiArrowUp from "~icons/mdi/arrow-down";
  import MdiMapMarkerOutline from "~icons/mdi/map-marker-outline";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";

  const props = defineProps({
    location: {
      type: Object as () => EntitySummary | EntityOut,
      required: true,
    },
    overview: { type: Boolean, default: false },
    dense: {
      type: Boolean,
      default: false,
    },
  });

  const hasCount = computed(() => {
    return !!(props.location as EntitySummary).itemCount;
  });

  const count = computed(() => {
    return hasCount.value ? (props.location as EntitySummary).itemCount : undefined;
  });
</script>
