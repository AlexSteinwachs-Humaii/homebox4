<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { ImageOff } from "lucide-vue-next";
  import BaseContainer from "~/components/Base/Container.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import Feedback from "~/components/WarmHabitat/Feedback.vue";
  import ItemForm from "~/components/Entity/ItemForm.vue";
  import { Button } from "~/components/ui/button";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import { scopedResource } from "~/lib/data/scoped-resource";
  import { emptyItemForm } from "~/lib/items/item-form";
  import { flatTree } from "~/composables/use-location-helpers";
  import { useItemCapture } from "~/composables/use-item-capture";
  import { useLocationStore } from "~/stores/locations";

  definePageMeta({ middleware: ["auth"] });
  const { t } = useI18n();
  useHead({ title: "HomeBox | " + t("home.add_item") });
  const route = useRoute();
  const preferences = useViewPreferences();
  const collectionId = computed(() => preferences.value.collectionId);
  const { selectedCollection } = useCollections();
  const { openDialog } = useDialog();
  const form = ref(emptyItemForm());
  const capture = useItemCapture(collectionId, () => useUserApi().items);
  const locations = useLocationStore();
  const locked = computed(
    () => capture.pending.value || capture.stage.value === "uncertain" || capture.stage.value === "saved"
  );
  async function save() {
    if (!metadata.data.value) return;
    const id = await capture.save(form.value, metadata.data.value);
    if (!id) return;
    // Overview and Inventory load fresh scoped resources on mount; clear the shared location cache too.
    locations.parents = null;
    locations.Locations = null;
    locations.tree = null;
    locations.refreshLocationsPromise = null;
    await navigateTo(`/item/${id}`);
  }
  let initialized = false;
  // No identity or options may survive a collection switch.
  watch(
    collectionId,
    () => {
      initialized = false;
      form.value = emptyItemForm();
    },
    { flush: "sync" }
  );

  const metadata = scopedResource(collectionId, async () => {
    const api = useUserApi();
    const [types, tree, locations, tags, group] = await Promise.all([
      api.entityTypes.getAll(),
      api.items.getTree({ withItems: false }),
      api.items.getLocations({ filterChildren: false }),
      api.tags.getAll(),
      api.group.get(),
    ]);
    if (types.error || tree.error || locations.error || tags.error || group.error)
      throw new Error("Unable to load capture options");
    return {
      types: types.data,
      tree: flatTree(tree.data),
      locations: locations.data,
      tags: tags.data,
      currency: group.data.currency,
    };
  });
  watch(metadata.data, options => {
    if (!options || initialized) return;
    initialized = true;
    // A URL hint is never treated as an authorized parent without checking this collection.
    const locationId = typeof route.query.location === "string" ? route.query.location : null;
    form.value.location = options.locations.find(location => location.id === locationId) ?? null;
    form.value.entityTypeId = options.types.find(type => !type.isLocation)?.id ?? "";
  });
  const cancel = () => navigateTo("/items");
  const advanced = () => openDialog(DialogID.CreateEntity, { params: { baseType: "item" } });
</script>

<template>
  <BaseContainer class="space-y-6">
    <ItemContext :title="t('home.add_item')" :description="t('capture.subtitle')">
      <template #breadcrumb
        ><NuxtLink to="/items" class="text-sm text-link underline">{{
          t("items.back_to_inventory")
        }}</NuxtLink></template
      >
      <template #metadata
        ><p v-if="selectedCollection" class="text-sm text-muted-foreground">
          {{ selectedCollection.name }}
        </p></template
      >
    </ItemContext>
    <Feedback v-if="!collectionId" :title="t('home.choose_collection')" />
    <Feedback v-else-if="metadata.pending.value" :title="t('capture.loading')" />
    <Feedback v-else-if="metadata.error.value" :title="t('capture.load_failed')" tone="error">
      {{ t("capture.retry_help") }}
      <template #actions
        ><Button variant="outline" @click="metadata.refresh">{{ t("global.retry") }}</Button></template
      >
    </Feedback>
    <form v-else-if="metadata.data.value" class="space-y-6" @submit.prevent="save">
      <Feedback
        v-if="capture.stage.value !== 'idle' && capture.stage.value !== 'saved'"
        :title="t(`capture.${capture.stage.value}`)"
        tone="error"
      >
        <p v-if="capture.status.value">
          {{ t("capture.request_status", { status: capture.status.value }) }}
        </p>
        <ul v-if="capture.errors.value.length" class="list-inside list-disc">
          <li v-for="field in capture.errors.value" :key="field">
            {{ t(`capture.validation.${field}`) }}
          </li>
        </ul>
        <NuxtLink v-if="capture.entity.value" :to="`/item/${capture.entity.value.id}`" class="text-link underline">
          {{ t("capture.view_existing", { id: capture.entity.value.id }) }}
        </NuxtLink>
        <NuxtLink v-if="capture.stage.value === 'uncertain'" to="/items" class="text-link underline">{{
          t("items.back_to_inventory")
        }}</NuxtLink>
      </Feedback>
      <fieldset
        :disabled="locked"
        :aria-busy="capture.pending.value"
        class="grid min-w-0 items-start gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <Panel>
          <template #header
            ><h2 class="habitat-heading text-2xl">
              {{ t("capture.item_information") }}
            </h2></template
          >
          <div class="p-6">
            <ItemForm
              v-model="form"
              :types="metadata.data.value.types"
              :locations="metadata.data.value.tree"
              :tags="metadata.data.value.tags"
              :currency="metadata.data.value.currency"
            />
          </div>
        </Panel>
        <aside class="space-y-6">
          <Panel class="space-y-3 p-6 text-muted-foreground">
            <div class="flex min-h-40 items-center justify-center rounded-lg bg-muted">
              <ImageOff class="size-12" aria-hidden="true" />
            </div>
            <p class="text-sm">{{ t("capture.no_photo") }}</p>
          </Panel>
          <Panel class="space-y-4 p-6">
            <h2 class="habitat-heading text-2xl">
              {{ t("capture.start_simple") }}
            </h2>
            <p class="text-sm text-muted-foreground">{{ t("capture.help") }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t("capture.advanced_help") }}
            </p>
            <Button type="button" variant="outline" class="whitespace-normal" @click="advanced">{{
              t("capture.advanced")
            }}</Button>
          </Panel>
        </aside>
      </fieldset>
      <footer class="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p id="capture-save-status" class="text-sm text-muted-foreground">
          {{ t(capture.entity.value ? "capture.leave_partial" : "capture.save_help") }}
        </p>
        <div class="flex gap-3">
          <Button type="button" variant="outline" :disabled="capture.pending.value" @click="cancel">{{
            t(capture.entity.value ? "items.back_to_inventory" : "global.cancel")
          }}</Button>
          <Button type="submit" :disabled="locked" aria-describedby="capture-save-status">{{
            t(
              capture.pending.value
                ? "capture.saving"
                : capture.entity.value
                  ? "capture.retry_update"
                  : "capture.save_item"
            )
          }}</Button>
        </div>
      </footer>
    </form>
  </BaseContainer>
</template>
