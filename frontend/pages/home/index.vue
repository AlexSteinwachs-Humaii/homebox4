<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { Plus, ScanLine, MapPin, ArrowRight } from "lucide-vue-next";
  import { loadStatistics } from "./statistics";
  import { loadRecentItems } from "./table";
  import { scopedResource } from "~/lib/data/scoped-resource";
  import { fmtCurrency } from "~/composables/utils";
  import { fmtDate, getLocaleCode } from "~/composables/use-formatters";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import BaseContainer from "~/components/Base/Container.vue";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import Feedback from "~/components/WarmHabitat/Feedback.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
  import Thumbnail from "~/components/WarmHabitat/Thumbnail.vue";
  import { Button } from "~/components/ui/button";

  const { t } = useI18n();
  definePageMeta({ middleware: ["auth"] });
  useHead({ title: "HomeBox | " + t("menu.overview") });
  const api = useUserApi();
  const preferences = useViewPreferences();
  const collectionId = computed(() => preferences.value.collectionId);
  const { selectedCollection } = useCollections();
  const { openDialog } = useDialog();

  // useUserApi snapshots X-Tenant at construction: create a fresh client for each load.
  const statistics = scopedResource(collectionId, () => loadStatistics(useUserApi()));
  const recent = scopedResource(collectionId, () => loadRecentItems(useUserApi()));
  // Read directly instead of the legacy store getter, which collapses loading/failure into an empty array.
  const locations = scopedResource(collectionId, async () => {
    const result = await useUserApi().items.getLocations({
      filterChildren: true,
    });
    if (result.error) throw new Error("Unable to load locations");
    return result.data;
  });
  const stats = computed(() => {
    const data = statistics.data.value;
    return [
      {
        label: t("home.item_records"),
        value: data?.totalItems,
        note: t("home.not_units"),
        to: "/items",
      },
      {
        label: t("home.recorded_value"),
        value: data ? fmtCurrency(data.totalItemPrice, data.currency, getLocaleCode()) : undefined,
        note: t("home.value_formula"),
        to: "/items",
      },
      {
        label: t("menu.locations"),
        value: data?.totalLocations,
        note: t("home.collection_places"),
        to: "/locations",
      },
      { label: t("home.tags"), value: data?.totalTags, note: t("home.organize") },
    ];
  });
  function refresh() {
    void statistics.refresh();
    void recent.refresh();
    void locations.refresh();
  }
  onServerEvent(ServerEvent.EntityMutation, refresh);
  onServerEvent(ServerEvent.TagMutation, () => void statistics.refresh());
  const imageUrl = (item: { id: string; thumbnailId?: string | null; imageId?: string | null }) => {
    const attachmentId = item.thumbnailId || item.imageId;
    return attachmentId ? api.authURL(`/entities/${item.id}/attachments/${attachmentId}`) : undefined;
  };
</script>

<template>
  <BaseContainer class="space-y-6">
    <ItemContext :title="t('menu.overview')" :description="t('home.overview_description')">
      <template #metadata>
        <p class="text-sm text-muted-foreground">
          {{ selectedCollection?.name }}
        </p>
      </template>
      <template #actions>
        <Button variant="outline" @click="openDialog(DialogID.Scanner)"
          ><ScanLine class="mr-2 size-4" />{{ t("menu.scanner") }}</Button
        >
        <Button @click="openDialog(DialogID.CreateEntity, { params: { baseType: 'item' } })"
          ><Plus class="mr-2 size-4" />{{ t("home.add_item") }}</Button
        >
      </template>
    </ItemContext>

    <Feedback v-if="!collectionId" :title="t('home.choose_collection')" />
    <section :aria-label="t('home.quick_statistics')" :aria-busy="statistics.pending.value">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel v-for="stat in stats" :key="stat.label" class="relative space-y-3 p-5">
          <h2 class="font-sans text-sm text-muted-foreground">
            <NuxtLink v-if="stat.to" :to="stat.to" class="habitat-link after:absolute after:inset-0">{{ stat.label }}</NuxtLink>
            <template v-else>{{ stat.label }}</template>
          </h2>
          <p class="text-3xl font-bold tabular-nums">{{ stat.value ?? "—" }}</p>
          <p class="text-xs text-muted-foreground">{{ stat.note }}</p>
        </Panel>
      </div>
      <p v-if="statistics.pending.value" role="status" class="mt-3 text-sm text-muted-foreground">
        {{ t("global.loading") }}
      </p>
      <Feedback v-else-if="statistics.error.value" :title="t('home.statistics_failed')" tone="error" class="mt-3">
        <template #actions
          ><Button variant="outline" @click="statistics.refresh()">{{ t("home.retry") }}</Button></template
        >
      </Feedback>
    </section>

    <Panel class="flex flex-wrap items-center justify-between gap-4 bg-accent p-6">
      <div class="space-y-2">
        <h2 class="habitat-heading text-2xl">{{ t("home.welcome_title") }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t("home.welcome_description") }}
        </p>
      </div>
      <NuxtLink to="/items" class="habitat-link">{{ t("home.view_inventory") }} →</NuxtLink>
    </Panel>

    <div class="grid items-start gap-6 lg:grid-cols-3">
      <Panel class="min-w-0 lg:col-span-2" :aria-busy="recent.pending.value">
        <template #header>
          <h2 class="habitat-heading text-2xl">
            {{ t("home.recently_added") }}
          </h2>
          <NuxtLink to="/items" class="habitat-link text-sm">{{ t("home.view_all") }} →</NuxtLink>
        </template>
        <p v-if="recent.pending.value" role="status" class="p-6 text-sm text-muted-foreground">
          {{ t("global.loading") }}
        </p>
        <Feedback v-else-if="recent.error.value" :title="t('home.recent_failed')" tone="error" class="m-4">
          <template #actions
            ><Button variant="outline" @click="recent.refresh()">{{ t("home.retry") }}</Button></template
          >
        </Feedback>
        <p v-else-if="recent.data.value?.length === 0" class="p-6 text-sm text-muted-foreground">
          {{ t("items.no_results") }}
        </p>
        <ul v-else class="divide-y">
          <li v-for="item in recent.data.value" :key="item.id">
            <NuxtLink :to="`/item/${item.id}`" class="flex flex-wrap items-center gap-4 p-6 hover:bg-accent">
              <Thumbnail :src="imageUrl(item)" :name="item.name" :fallback-label="t('home.no_photo')" />
              <div class="min-w-0 flex-1">
                <p class="break-words font-semibold">{{ item.name }}</p>
                <p class="break-words text-sm text-muted-foreground">
                  {{ item.locationTrail || t("home.no_location") }}
                </p>
              </div>
              <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{{ t("global.quantity") }} {{ item.quantity }}</span>
                <time :datetime="new Date(item.createdAt).toISOString()">{{ fmtDate(item.createdAt, "short") }}</time>
              </div>
            </NuxtLink>
          </li>
        </ul>
      </Panel>

      <div class="min-w-0 space-y-6">
        <Panel>
          <template #header
            ><h2 class="habitat-heading text-2xl">
              {{ t("home.quick_actions") }}
            </h2></template
          >
          <div class="divide-y px-6">
            <button
              type="button"
              class="flex w-full items-center gap-3 py-4 text-left text-sm"
              @click="
                openDialog(DialogID.CreateEntity, {
                  params: { baseType: 'item' },
                })
              "
            >
              <Plus class="size-4" />{{ t("home.add_item") }}<ArrowRight class="ml-auto size-4 text-link" />
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-3 py-4 text-left text-sm"
              @click="openDialog(DialogID.Scanner)"
            >
              <ScanLine class="size-4" />{{ t("menu.scanner") }}<ArrowRight class="ml-auto size-4 text-link" />
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-3 py-4 text-left text-sm"
              @click="
                openDialog(DialogID.CreateEntity, {
                  params: { baseType: 'location' },
                })
              "
            >
              <MapPin class="size-4" />{{ t("home.create_location") }}<ArrowRight class="ml-auto size-4 text-link" />
            </button>
          </div>
        </Panel>
        <Panel :aria-busy="locations.pending.value">
          <template #header>
            <h2 class="habitat-heading text-2xl">
              {{ t("home.browse_locations") }}
            </h2>
            <NuxtLink to="/locations" class="habitat-link text-sm">{{ t("home.view_all") }} →</NuxtLink>
          </template>
          <p v-if="locations.pending.value" role="status" class="p-6 text-sm text-muted-foreground">
            {{ t("global.loading") }}
          </p>
          <Feedback v-else-if="locations.error.value" :title="t('home.locations_failed')" tone="error" class="m-4">
            <template #actions
              ><Button variant="outline" @click="locations.refresh()">{{ t("home.retry") }}</Button></template
            >
          </Feedback>
          <p v-else-if="locations.data.value?.length === 0" class="p-6 text-sm text-muted-foreground">
            {{ t("locations.no_results") }}
          </p>
          <ul v-else class="space-y-4 p-6">
            <li v-for="location in locations.data.value" :key="location.id">
              <NuxtLink :to="`/location/${location.id}`" class="flex items-center gap-3">
                <Thumbnail :src="imageUrl(location)" :name="location.name" :fallback-label="t('home.no_photo')" />
                <span class="min-w-0 flex-1">
                  <span class="block break-words">{{ location.name }}</span>
                  <span v-if="location.description" class="block break-words text-sm text-muted-foreground">{{ location.description }}</span>
                </span>
                <ArrowRight class="size-4 shrink-0 text-link" aria-hidden="true" />
              </NuxtLink>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
    <p class="text-xs text-muted-foreground">
      {{
        t("home.scope_note", {
          collection: selectedCollection?.name || t("home.selected_collection"),
        })
      }}
    </p>
  </BaseContainer>
</template>
