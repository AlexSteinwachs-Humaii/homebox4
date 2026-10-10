<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { Input } from "~/components/ui/input";
  import type { EntitySummary, TagSummary, TreeItem } from "~/lib/api/types/data-contracts";
  import MdiLoading from "~icons/mdi/loading";
  import MdiMagnify from "~icons/mdi/magnify";
  import MdiDelete from "~icons/mdi/delete";
  import { Plus } from "lucide-vue-next";
  import { Button } from "@/components/ui/button";
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { Separator } from "@/components/ui/separator";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import BaseContainer from "@/components/Base/Container.vue";
  import SearchFilter from "~/components/Search/Filter.vue";
  import ItemViewSelectable from "~/components/Item/View/Selectable.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import Feedback from "~/components/WarmHabitat/Feedback.vue";
  import { scopedResource } from "~/lib/data/scoped-resource";
  import { parseInventoryQuery, inventoryApiQuery, queryDefaults, cleanInventoryQuery } from "./inventory-query";
  import { useDialog } from "~/components/ui/dialog-provider";
  import { DialogID } from "~/components/ui/dialog-provider/utils";

  const { t } = useI18n();
  definePageMeta({ middleware: ["auth"] });
  useHead({ title: "HomeBox | " + t("menu.inventory") });
  const route = useRoute();
  const router = useRouter();
  const preferences = useViewPreferences();
  const collectionId = computed(() => preferences.value.collectionId);
  const { selectedCollection } = useCollections();
  const { openDialog } = useDialog();
  const state = computed(() => parseInventoryQuery(route.query));
  const pageSize = computed(() => preferences.value.itemsPerTablePage || 12);
  function update(values: Partial<typeof queryDefaults>, resetPage = true) {
    const next = { ...route.query, ...values, ...(resetPage ? { page: 1 } : {}) };
    return router.push({ query: cleanInventoryQuery(next) });
  }
  function control<K extends keyof typeof queryDefaults>(key: K) {
    return computed({
      get: () => state.value[key],
      set: value => void update({ [key]: value }),
    });
  }
  const query = control("q");
  const page = computed({
    get: () => state.value.page,
    set: value => void update({ page: value }, false),
  });
  const includeArchived = control("archived");
  const fieldSelector = control("fieldSelector");
  const negateTags = control("negateTags");
  const onlyWithoutPhoto = control("onlyWithoutPhoto");
  const onlyWithPhoto = control("onlyWithPhoto");
  const orderBy = control("orderBy");
  watch(onlyWithPhoto, value => {
    if (value && onlyWithoutPhoto.value) void update({ onlyWithoutPhoto: false });
  });
  watch(onlyWithoutPhoto, value => {
    if (value && onlyWithPhoto.value) void update({ onlyWithPhoto: false });
  });
  watch(fieldSelector, value => {
    if (!value) void update({ fields: [] });
  });
  watch(pageSize, () => void update({ page: 1 }));

  const metadata = scopedResource(collectionId, async () => {
    const api = useUserApi();
    const [locations, tags, fields] = await Promise.all([
      api.items.getTree({ withItems: false }),
      api.tags.getAll(),
      api.items.fields.getAll(),
    ]);
    if (locations.error || tags.error || fields.error) throw new Error("Unable to load filters");
    const flat: FlatTreeItem[] = [];
    function flatten(tree: TreeItem[], prefix = "") {
      for (const node of tree) {
        const name = prefix + node.name;
        flat.push({ id: node.id, name: node.name, treeString: name });
        flatten(node.children || [], name + " / ");
      }
    }
    flatten(locations.data);
    return { locations: flat, tags: tags.data, fields: fields.data };
  });
  const locationFlatTree = computed(() => metadata.data.value?.locations || []);
  const tags = computed(() => metadata.data.value?.tags || []);
  const allFields = computed(() => metadata.data.value?.fields || []);
  const selectedLocations = computed({
    get: () => locationFlatTree.value.filter(l => state.value.loc.includes(l.id)),
    set: (value: { id: string }[]) => void update({ loc: value.map(l => l.id) }),
  });
  const selectedTags = computed({
    get: () => tags.value.filter(tag => state.value.tag.includes(tag.id)),
    set: (value: TagSummary[]) => void update({ tag: value.map(tag => tag.id) }),
  });
  const fieldTuples = ref<[string, string][]>([]);
  const fieldValuesCache = ref<Record<string, string[]>>({});
  let fieldsGeneration = 0;
  async function fetchValues(field: string) {
    const generation = fieldsGeneration;
    const result = await useUserApi().items.fields.getAllValues(field);
    if (!result.error && generation === fieldsGeneration) fieldValuesCache.value[field] = result.data;
  }
  watch(
    collectionId,
    () => {
      fieldsGeneration++;
      fieldValuesCache.value = {};
    },
    { flush: "sync" }
  );
  watch(
    () => state.value.fields,
    fields => {
      if (JSON.stringify(fields) === JSON.stringify(fieldTuples.value.map(f => f.join("=")))) return;
      fieldTuples.value = fields.map(f => {
        const i = f.indexOf("=");
        return [f.slice(0, i), f.slice(i + 1)];
      });
      fieldTuples.value.forEach(f => void fetchValues(f[0]));
    },
    { immediate: true }
  );
  watch(
    fieldTuples,
    tuples => {
      const fields = tuples.filter(f => f[0] && f[1]).map(f => f.join("="));
      if (JSON.stringify(fields) !== JSON.stringify(state.value.fields)) void update({ fields });
    },
    { deep: true }
  );

  const requestKey = computed(() =>
    collectionId.value ? JSON.stringify([collectionId.value, state.value, pageSize.value]) : null
  );
  const results = scopedResource(requestKey, async () => {
    const api = useUserApi();
    const result = await api.items.getAll(inventoryApiQuery(state.value, pageSize.value));
    if (result.error || !result.data) throw new Error("Unable to search items");
    const items = await Promise.all(
      result.data.items.map(async item => {
        const path = await api.items.fullpath(item.id);
        if (path.error) throw new Error("Unable to load location trail");
        return {
          ...item,
          locationTrail: path.data
            .filter(p => p.id !== item.id)
            .map(p => p.name)
            .join(" / "),
        };
      })
    );
    return { total: result.data.total, items };
  });
  const loading = results.pending;
  const items = computed<EntitySummary[]>(() => results.data.value?.items || []);
  const total = computed(() => results.data.value?.total || 0);
  const pagination = proxyRefs({
    page,
    pageSize,
    totalSize: total,
    setPage: (value: number) => {
      page.value = Math.max(1, value);
    },
  });
  const byAssetId = computed(() => query.value.startsWith("#"));
  const parsedAssetId = computed(() => {
    const id = Number.parseInt(query.value.slice(1).replace(/["-]/g, ""));
    return Number.isNaN(id) ? t("items.invalid_asset_id") : id;
  });
  const search = () => results.refresh();
  const submit = () => search();
  const reset = () => update(queryDefaults);
</script>

<template>
  <BaseContainer class="space-y-6">
    <ItemContext :title="t('menu.inventory')">
      <template #metadata
        ><p class="text-sm text-muted-foreground">
          {{ selectedCollection?.name }} · {{ t("items.results", { total }) }}
        </p></template
      >
      <template #actions
        ><Button @click="openDialog(DialogID.CreateEntity, { params: { baseType: 'item' } })"
          ><Plus />{{ t("home.add_item") }}</Button
        ></template
      >
    </ItemContext>
    <Panel class="overflow-hidden p-0">
      <div class="space-y-4 border-b p-5">
        <div class="flex flex-wrap items-end gap-4 md:flex-nowrap">
          <div class="w-full">
            <Input
              v-model:model-value="query"
              :aria-label="$t('global.search')"
              :placeholder="$t('inventory.search_placeholder')"
              class="h-12"
              @keydown.enter.prevent="submit"
            />
            <div v-if="byAssetId" class="pl-2 pt-2 text-sm">
              <p>{{ $t("items.query_id", { id: parsedAssetId }) }}</p>
            </div>
          </div>
          <Button class="mb-auto h-12 w-full md:w-auto" @click.prevent="submit">
            <MdiLoading v-if="loading" class="animate-spin" />
            <MdiMagnify v-else />
            {{ $t("global.search") }}
          </Button>
        </div>

        <div class="flex w-full flex-wrap gap-2 py-2 md:flex-nowrap">
          <SearchFilter
            v-model="selectedLocations"
            :label="$t('inventory.direct_locations')"
            :options="locationFlatTree"
          />
          <SearchFilter v-model="selectedTags" :label="$t('global.tags')" :options="tags" />
          <Popover>
            <PopoverTrigger as-child>
              <Button size="sm" variant="outline"> {{ $t("items.options") }}</Button>
            </PopoverTrigger>
            <PopoverContent class="z-40 flex flex-col gap-2">
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="includeArchived" class="ml-auto" />
                <div class="grow" />
                <span class="text-right">
                  {{ $t("items.include_archive") }}
                </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="fieldSelector" class="ml-auto" />
                <div class="grow" />
                <span class="text-right">
                  {{ $t("items.field_selector") }}
                </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="negateTags" class="ml-auto" />
                <div class="grow" />
                <span class="text-right"> {{ $t("items.negate_tags") }} </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="onlyWithoutPhoto" class="ml-auto" />
                <div class="grow" />
                <span class="text-right">
                  {{ $t("items.only_without_photo") }}
                </span>
              </Label>
              <Label class="flex cursor-pointer items-center">
                <Switch v-model="onlyWithPhoto" class="ml-auto" />
                <div class="grow" />
                <span class="text-right">
                  {{ $t("items.only_with_photo") }}
                </span>
              </Label>
              <Label class="flex cursor-pointer flex-col gap-2">
                <span class="text-right">
                  <span class="text-right"> {{ $t("items.order_by") }} </span>
                </span>

                <Select v-model="orderBy">
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('items.order_by')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">
                      {{ $t("items.name") }}
                    </SelectItem>
                    <SelectItem value="createdAt">
                      {{ $t("items.created_at") }}
                    </SelectItem>
                    <SelectItem value="updatedAt">
                      {{ $t("items.updated_at") }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Label>
              <Separator />
              <Button @click="reset"> {{ $t("items.reset_search") }} </Button>
            </PopoverContent>
          </Popover>
          <div class="grow" />
          <span class="my-auto text-sm text-muted-foreground"
            >{{ t("items.order_by") }}:
            {{
              t(orderBy === "name" ? "items.name" : orderBy === "createdAt" ? "items.created_at" : "items.updated_at")
            }}</span
          >
          <Popover>
            <PopoverTrigger as-child>
              <Button size="sm" variant="outline"> {{ $t("items.tips") }}</Button>
            </PopoverTrigger>
            <PopoverContent class="z-40 w-[325px]" align="end">
              <p class="text-base">{{ $t("items.tips_sub") }}</p>
              <ul class="mt-1 list-disc pl-6 text-sm">
                <li>
                  {{ $t("items.tip_1") }}
                </li>
                <li>
                  {{ $t("items.tip_2") }}
                </li>
                <li>
                  {{ $t("items.tip_3") }}
                </li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>
        <div v-if="fieldSelector" class="flex flex-col gap-2 pb-2">
          <p>{{ $t("items.custom_fields") }}</p>
          <div v-for="(f, idx) in fieldTuples" :key="idx" class="flex flex-wrap gap-2">
            <div class="flex w-full flex-col gap-1 md:w-auto md:grow">
              <Label> {{ $t("items.field") }} </Label>
              <Select v-model="fieldTuples[idx]![0]" @update:model-value="fetchValues(f[0])">
                <SelectTrigger>
                  <SelectValue :placeholder="$t('items.select_field')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="field in allFields" :key="field" :value="field">
                    {{ field }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="flex w-full flex-col gap-1 md:w-auto md:grow">
              <Label> {{ $t("items.field_value") }} </Label>
              <Select v-model="fieldTuples[idx]![1]">
                <SelectTrigger>
                  <SelectValue :placeholder="$t('items.select_value')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="value in fieldValuesCache[f[0]]" :key="value" :value="value">
                    {{ value }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="destructive" type="button" size="icon" class="my-auto" @click="fieldTuples.splice(idx, 1)">
              <MdiDelete />
            </Button>
          </div>
          <Button type="button" size="sm" class="mt-2" @click="() => fieldTuples.push(['', ''])">
            {{ $t("items.add") }}
          </Button>
        </div>
      </div>

      <Feedback v-if="metadata.error.value" :title="t('inventory.filters_failed')" tone="error">
        <template #actions
          ><Button variant="outline" @click="metadata.refresh">{{ t("global.retry") }}</Button></template
        >
      </Feedback>
      <Feedback v-if="loading" :title="t('inventory.loading')" />
      <Feedback v-else-if="results.error.value" :title="t('items.toast.failed_search_items')" tone="error">
        <template #actions
          ><Button variant="outline" @click="search">{{ t("global.retry") }}</Button></template
        >
      </Feedback>
      <section v-else class="p-5">
        <ItemViewSelectable
          :items="items"
          :location-flat-tree="locationFlatTree"
          :pagination="pagination"
          disable-sort
          @refresh="async () => search()"
        />
      </section>
    </Panel>
    <p class="text-sm text-muted-foreground">{{ t("inventory.price_note") }}</p>
  </BaseContainer>
</template>
