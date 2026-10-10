<script setup lang="ts">
  import BaseCard from "@/components/Base/Card.vue";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import DateTime from "~/components/global/DateTime.vue";
  import { maintenanceCalendarDate, useMaintenanceSchedule } from "~/composables/use-maintenance-schedule";
  import { defineObserver } from "~/composables/use-api";
  import { useMaintenanceContext } from "~/composables/use-maintenance-context";

  const preferences = useViewPreferences();
  const collectionId = computed(() => preferences.value.collectionId);
  const { entries, loading, failed, refresh } = useMaintenanceSchedule(collectionId, () => useUserApi().maintenance);
  const { items, contextEntry, contextItem } = useMaintenanceContext(collectionId, entries, () => useUserApi().items);
  onServerEvent(ServerEvent.EntityMutation, () => void refresh());
  const removeObserver = defineObserver("maintenance-schedule", {
    handler: (response, request) => {
      // Existing item maintenance dialogs may update records while this view is mounted.
      if (
        response.ok &&
        request?.method &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase()) &&
        /\/maintenance(?:\/|\?|$)/.test(response.url)
      ) {
        void refresh();
      }
    },
  });
  onScopeDispose(removeObserver);
</script>

<template>
  <section aria-labelledby="maintenance-schedule-heading" :aria-busy="loading" class="space-y-6">
    <div class="border-b pb-3 text-sm font-medium text-primary">
      {{ $t("maintenance.filter.scheduled") }}
    </div>
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <BaseCard class="min-w-0">
        <div class="border-b p-6">
          <h2 id="maintenance-schedule-heading" class="font-serif text-2xl">
            {{ $t("maintenance.schedule.work") }}
          </h2>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.status_help") }}
          </p>
        </div>
        <p v-if="!collectionId" class="p-6" role="status">
          {{ $t("maintenance.schedule.select_collection") }}
        </p>
        <p v-else-if="loading" class="p-6" role="status">
          {{ $t("maintenance.schedule.loading") }}
        </p>
        <div v-else-if="failed" class="p-6" role="alert">
          <p>{{ $t("maintenance.schedule.failed") }}</p>
          <Button class="mt-3" variant="outline" @click="refresh">{{ $t("maintenance.schedule.retry") }}</Button>
        </div>
        <p v-else-if="!entries.length" class="p-6" role="status">
          {{ $t("maintenance.schedule.empty") }}
        </p>
        <ul v-else class="divide-y">
          <li v-for="entry in entries" :key="entry.id" class="flex flex-col gap-4 p-6 sm:flex-row">
            <div class="shrink-0 rounded-lg border bg-background p-3 text-sm sm:w-40">
              <span class="mb-1 block text-xs text-muted-foreground">{{ $t("maintenance.schedule.due") }}</span>
              <time v-if="maintenanceCalendarDate(entry.scheduledDate)" :datetime="String(entry.scheduledDate)">
                <DateTime :date="entry.scheduledDate" format="human" datetime-type="date" />
              </time>
              <span v-else>{{ $t("maintenance.schedule.no_due_date") }}</span>
            </div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <h3 class="break-words font-semibold">
                  {{ entry.name || $t("maintenance.schedule.unnamed") }}
                </h3>
                <Badge variant="outline">{{ $t("maintenance.filter.scheduled") }}</Badge>
              </div>
              <NuxtLink
                v-if="entry.itemID"
                :to="`/item/${entry.itemID}`"
                class="block break-words text-primary underline"
              >
                {{ entry.itemName || $t("maintenance.schedule.unnamed_item") }}
              </NuxtLink>
              <p v-else class="text-sm text-muted-foreground">
                {{ $t("maintenance.schedule.item_unavailable") }}
              </p>
              <div class="text-sm text-muted-foreground">
                <template v-if="items[entry.itemID]">
                  <NuxtLink
                    v-if="items[entry.itemID]?.location"
                    :to="`/location/${items[entry.itemID]?.location?.id}`"
                    class="underline"
                  >
                    {{ items[entry.itemID]?.location?.name }}
                  </NuxtLink>
                  <span v-else>{{ $t("maintenance.schedule.no_location") }}</span>
                  <span
                    v-if="
                      items[entry.itemID]?.parent &&
                      items[entry.itemID]?.parent?.id !== items[entry.itemID]?.location?.id
                    "
                  >
                    · {{ $t("maintenance.schedule.inside") }}
                    <NuxtLink :to="`/item/${items[entry.itemID]?.parent?.id}`" class="underline">{{
                      items[entry.itemID]?.parent?.name
                    }}</NuxtLink>
                  </span>
                </template>
                <span v-else>{{ $t("maintenance.schedule.context_unavailable") }}</span>
              </div>
              <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {{ entry.description || $t("maintenance.schedule.no_description") }}
              </p>
            </div>
          </li>
        </ul>
      </BaseCard>
      <BaseCard class="min-w-0 space-y-4 p-6">
        <template v-if="contextEntry">
          <h2 class="font-serif text-2xl">
            {{ $t("maintenance.schedule.item_context") }}
          </h2>
          <template v-if="contextItem">
            <h3 class="break-words font-semibold">{{ contextItem.name }}</h3>
            <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {{ contextItem.description || $t("maintenance.schedule.no_description") }}
            </p>
            <NuxtLink :to="`/item/${contextItem.id}`" class="block text-primary underline">{{
              $t("maintenance.schedule.open_item")
            }}</NuxtLink>
          </template>
          <p v-else class="text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.context_unavailable") }}
          </p>
          <hr />
        </template>
        <h2 class="mb-3 font-serif text-2xl">
          {{ $t("maintenance.schedule.read_only") }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ $t("maintenance.schedule.read_only_help") }}
        </p>
      </BaseCard>
    </div>
  </section>
</template>
