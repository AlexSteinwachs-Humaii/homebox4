<script setup lang="ts">
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import DateTime from "~/components/global/DateTime.vue";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import { maintenanceCalendarDate, useMaintenanceSchedule } from "~/composables/use-maintenance-schedule";
  import { defineObserver } from "~/composables/use-api";
  import { maintenanceContextState, useMaintenanceContext } from "~/composables/use-maintenance-context";
  import type { EntityOut } from "~/lib/api/types/data-contracts";

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

  function contextFor(itemID: string | undefined) {
    return maintenanceContextState(items.value, itemID);
  }
  function loadedItem(itemID: string | undefined): EntityOut | null {
    return itemID ? (items.value[itemID] ?? null) : null;
  }
</script>

<template>
  <section aria-labelledby="maintenance-schedule-heading" :aria-busy="loading" class="space-y-6">
    <div class="border-b pb-3 text-sm font-medium text-primary">
      {{ $t("maintenance.filter.scheduled") }}
    </div>
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Panel class="min-w-0">
        <template #header>
          <div class="min-w-0">
            <h2 id="maintenance-schedule-heading" class="habitat-heading">
              {{ $t("maintenance.schedule.work") }}
            </h2>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ $t("maintenance.schedule.status_help") }}
            </p>
          </div>
        </template>
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
              <NuxtLink v-if="entry.itemID" :to="`/item/${entry.itemID}`" class="habitat-link block break-words">
                {{ entry.itemName || $t("maintenance.schedule.unnamed_item") }}
              </NuxtLink>
              <p v-else class="text-sm text-muted-foreground">
                {{ $t("maintenance.schedule.item_unavailable") }}
              </p>
              <div class="text-sm text-muted-foreground">
                <template v-if="contextFor(entry.itemID) === 'ready' && loadedItem(entry.itemID)">
                  <NuxtLink
                    v-if="loadedItem(entry.itemID)?.location?.id"
                    :to="`/location/${loadedItem(entry.itemID)?.location?.id}`"
                    class="habitat-link"
                  >
                    {{ loadedItem(entry.itemID)?.location?.name || $t("maintenance.schedule.no_location") }}
                  </NuxtLink>
                  <span v-else>{{ $t("maintenance.schedule.no_location") }}</span>
                  <span
                    v-if="
                      loadedItem(entry.itemID)?.parent?.id &&
                      loadedItem(entry.itemID)?.parent?.id !== loadedItem(entry.itemID)?.location?.id
                    "
                  >
                    · {{ $t("maintenance.schedule.inside") }}
                    <NuxtLink :to="`/item/${loadedItem(entry.itemID)?.parent?.id}`" class="habitat-link">{{
                      loadedItem(entry.itemID)?.parent?.name || $t("maintenance.schedule.unnamed_item")
                    }}</NuxtLink>
                  </span>
                </template>
                <span v-else-if="contextFor(entry.itemID) === 'loading'">{{
                  $t("maintenance.schedule.context_loading")
                }}</span>
                <span v-else-if="contextFor(entry.itemID) === 'unavailable'">{{
                  $t("maintenance.schedule.context_unavailable")
                }}</span>
              </div>
              <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {{ entry.description || $t("maintenance.schedule.no_description") }}
              </p>
            </div>
          </li>
        </ul>
      </Panel>
      <div class="min-w-0 space-y-6">
        <Panel v-if="contextEntry" class="space-y-4 p-6">
          <h2 class="habitat-heading">
            {{ $t("maintenance.schedule.item_context") }}
          </h2>
          <p class="text-sm text-muted-foreground">
            <span class="mb-1 block text-xs">{{ $t("maintenance.schedule.due") }}</span>
            <time
              v-if="maintenanceCalendarDate(contextEntry.scheduledDate)"
              :datetime="String(contextEntry.scheduledDate)"
            >
              <DateTime :date="contextEntry.scheduledDate" format="human" datetime-type="date" />
            </time>
            <span v-else>{{ $t("maintenance.schedule.no_due_date") }}</span>
          </p>
          <template v-if="contextFor(contextEntry.itemID) === 'ready' && contextItem">
            <h3 class="break-words font-semibold">{{ contextItem.name }}</h3>
            <p class="text-sm text-muted-foreground">
              <NuxtLink
                v-if="contextItem.location?.id"
                :to="`/location/${contextItem.location.id}`"
                class="habitat-link"
              >
                {{ contextItem.location.name || $t("maintenance.schedule.no_location") }}
              </NuxtLink>
              <span v-else>{{ $t("maintenance.schedule.no_location") }}</span>
              <span v-if="contextItem.parent?.id && contextItem.parent.id !== contextItem.location?.id">
                · {{ $t("maintenance.schedule.inside") }}
                <NuxtLink :to="`/item/${contextItem.parent.id}`" class="habitat-link">{{
                  contextItem.parent.name || $t("maintenance.schedule.unnamed_item")
                }}</NuxtLink>
              </span>
            </p>
            <p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {{ contextItem.description || $t("maintenance.schedule.no_description") }}
            </p>
            <NuxtLink :to="`/item/${contextItem.id}`" class="habitat-link block">{{
              $t("maintenance.schedule.open_item")
            }}</NuxtLink>
          </template>
          <p v-else-if="contextFor(contextEntry.itemID) === 'loading'" class="text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.context_loading") }}
          </p>
          <p v-else-if="contextFor(contextEntry.itemID) === 'missing'" class="text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.item_unavailable") }}
          </p>
          <p v-else class="text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.context_unavailable") }}
          </p>
        </Panel>
        <Panel class="space-y-3 p-6">
          <h2 class="habitat-heading">
            {{ $t("maintenance.schedule.read_only") }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ $t("maintenance.schedule.read_only_help") }}
          </p>
        </Panel>
      </div>
    </div>
  </section>
</template>
