<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import type { Detail, Details } from "~~/components/global/DetailsSection/types";
  import { filterZeroValues } from "~~/components/global/DetailsSection/types";
  import type { EntityOut, EntityPath, EntitySummary, ItemAttachment } from "~~/lib/api/types/data-contracts";
  import MdiPackageVariant from "~icons/mdi/package-variant";
  import MdiPlus from "~icons/mdi/plus";
  import MdiMinus from "~icons/mdi/minus";
  import MdiDelete from "~icons/mdi/delete";
  import MdiPlusBoxMultipleOutline from "~icons/mdi/plus-box-multiple-outline";
  import MdiContentSaveEdit from "~icons/mdi/content-save-edit";
  import MdiDotsVertical from "~icons/mdi/dots-vertical";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
  } from "@/components/ui/breadcrumb";
  import { Button, ButtonGroup } from "@/components/ui/button";
  import { useDialog } from "@/components/ui/dialog-provider";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { Card } from "@/components/ui/card";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import BaseContainer from "@/components/Base/Container.vue";
  import ItemImageDialog from "~/components/Item/ImageDialog.vue";
  import ItemDuplicateSettings from "~/components/Item/DuplicateSettings.vue";
  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import TagChip from "~/components/Tag/Chip.vue";
  import DateTime from "~/components/global/DateTime.vue";
  import LabelMaker from "~/components/global/LabelMaker.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import CopyText from "@/components/global/CopyText.vue";
  import DetailsSection from "~/components/global/DetailsSection/DetailsSection.vue";
  import ItemAttachmentsList from "~/components/Item/AttachmentsList.vue";
  import ItemDetails from "~/components/WarmHabitat/ItemDetails.vue";
  import ItemViewSelectable from "~/components/Item/View/Selectable.vue";

  const { t } = useI18n();

  const { openDialog, closeDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const route = useRoute();

  const itemId = computed<string>(() => route.params.id as string);
  const preferences = useViewPreferences();
  const api = computed(() => {
    // useUserApi captures the tenant header when constructed.
    void preferences.value.collectionId;
    return useUserApi();
  });

  const temporaryDuplicateSettings = ref<DuplicateSettings>({
    copyMaintenance: preferences.value.duplicateSettings.copyMaintenance,
    copyAttachments: preferences.value.duplicateSettings.copyAttachments,
    copyCustomFields: preferences.value.duplicateSettings.copyCustomFields,
    copyPrefixOverride: preferences.value.duplicateSettings.copyPrefixOverride,
  });

  const hasNested = computed<boolean>(() => {
    return route.path.replace(/\/$/, "").split("/").at(-1) !== itemId.value;
  });

  const item = ref<EntityOut>();
  const fullpath = ref<EntityPath[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  const items = ref<EntitySummary[]>([]);
  let loadVersion = 0;

  async function refresh() {
    const version = ++loadVersion;
    const id = itemId.value;
    item.value = undefined;
    fullpath.value = [];
    items.value = [];
    loading.value = true;
    failed.value = false;
    try {
      // Recreate the client so X-Tenant follows the currently selected collection.
      const client = useUserApi();
      const { data, error } = await client.items.get(id);
      if (version !== loadVersion) return;
      if (error || !data || data.id !== id) {
        failed.value = true;
        return;
      }
      item.value = data;
      const path = await client.items.fullpath(id);
      if (version === loadVersion && !path.error) fullpath.value = path.data;
      if (version === loadVersion) await refreshItemList();
    } catch {
      if (version === loadVersion) failed.value = true;
    } finally {
      if (version === loadVersion) loading.value = false;
    }
  }
  watch([itemId, () => preferences.value.collectionId], refresh, {
    immediate: true,
    flush: "sync",
  });
  onBeforeUnmount(() => {
    loadVersion++;
  });

  // Watch paths, not query strings or reactive data read by refresh. This also
  // covers Cancel and browser Back/Forward after saving without redirecting.
  watch(
    () => route.path.replace(/\/$/, ""),
    (path, previousPath) => {
      const detailPath = `/item/${itemId.value}`;
      if (path === detailPath && previousPath === `${detailPath}/edit`) refresh();
    }
  );

  async function adjustQuantity(amount: number) {
    if (!item.value) {
      return;
    }

    const newQuantity = item.value.quantity + amount;
    if (newQuantity < 0) {
      toast.error(t("items.toast.quantity_cannot_negative"));
      return;
    }

    const version = loadVersion;
    const resp = await api.value.items.patch(item.value.id, {
      id: item.value.id,
      quantity: newQuantity,
    });
    if (version !== loadVersion) return;

    if (resp.error) {
      toast.error(t("items.toast.failed_adjust_quantity"));
      return;
    }

    if (resp.data) {
      item.value = resp.data;
    }
  }

  type FilteredAttachments = {
    attachments: ItemAttachment[];
    warranty: ItemAttachment[];
    manuals: ItemAttachment[];
    receipts: ItemAttachment[];
  };

  type Photo = {
    thumbnailSrc?: string;
    originalSrc: string;
    attachmentId: string;
    originalType?: string;
  };

  const itemTags = computed(() => {
    return useTagStore().withAncestors(item.value?.tags || []);
  });

  const photos = computed<Photo[]>(() => {
    if (!item.value) {
      return [];
    }
    return (
      item.value.attachments.reduce((acc, cur) => {
        if (cur.type === "photo") {
          const photo: Photo = {
            originalSrc: api.value.authURL(`/entities/${item.value!.id}/attachments/${cur.id}`),
            originalType: cur.mimeType,
            attachmentId: cur.id,
          };
          if (cur.thumbnail) {
            photo.thumbnailSrc = api.value.authURL(`/entities/${item.value!.id}/attachments/${cur.thumbnail.id}`);
          } else {
            photo.thumbnailSrc = photo.originalSrc; // fallback to itself if no thumbnail
          }
          acc.push(photo);
        }
        return acc;
      }, [] as Photo[]) || []
    );
  });

  const attachments = computed<FilteredAttachments>(() => {
    if (!item.value) {
      return {
        attachments: [],
        manuals: [],
        warranty: [],
        receipts: [],
      };
    }

    return item.value.attachments.reduce(
      (acc, attachment) => {
        if (attachment.type === "photo") {
          return acc;
        }
        if (attachment.type === "warranty") {
          acc.warranty.push(attachment);
        } else if (attachment.type === "manual") {
          acc.manuals.push(attachment);
        } else if (attachment.type === "receipt") {
          acc.receipts.push(attachment);
        } else {
          acc.attachments.push(attachment);
        }
        return acc;
      },
      {
        attachments: [] as ItemAttachment[],
        warranty: [] as ItemAttachment[],
        manuals: [] as ItemAttachment[],
        receipts: [] as ItemAttachment[],
      }
    );
  });

  const showAttachments = computed(() => {
    if (preferences.value?.showEmpty) {
      return true;
    }

    return (
      attachments.value.attachments.length > 0 ||
      attachments.value.warranty.length > 0 ||
      attachments.value.manuals.length > 0 ||
      attachments.value.receipts.length > 0
    );
  });

  const attachmentDetails = computed(() => {
    const details: Detail[] = [];

    const push = (name: string, slot: string) => {
      details.push({
        name,
        text: "",
        slot,
      });
    };

    if (attachments.value.attachments.length > 0) {
      push("items.attachments", "attachments");
    }

    if (attachments.value.warranty.length > 0) {
      push("items.warranty", "warranty");
    }

    if (attachments.value.manuals.length > 0) {
      push("items.manuals", "manuals");
    }

    if (attachments.value.receipts.length > 0) {
      push("items.receipts", "receipts");
    }

    return details;
  });

  const showWarranty = computed(() => {
    if (preferences.value.showEmpty) {
      return true;
    }
    return item.value?.lifetimeWarranty || validDate(item.value?.warrantyExpires);
  });

  const warrantyDetails = computed(() => {
    const details: Details = [
      {
        name: "items.lifetime_warranty",
        text: item.value?.lifetimeWarranty ? "Yes" : "No",
      },
    ];

    if (item.value?.lifetimeWarranty) {
      details.push({
        name: "items.warranty_expires",
        text: "N/A",
      });
    } else {
      details.push({
        name: "items.warranty_expires",
        text: item.value?.warrantyExpires || "",
        type: "date",
        date: true,
      });
    }

    details.push({
      name: "items.warranty_details",
      type: "markdown",
      text: item.value?.warrantyDetails || "",
    });

    if (!preferences.value.showEmpty) {
      return filterZeroValues(details);
    }

    return details;
  });

  const showSold = computed(() => {
    if (preferences.value.showEmpty) {
      return true;
    }
    return item.value?.soldTo || item.value?.soldPrice !== 0 || validDate(item.value?.soldDate);
  });

  const soldDetails = computed<Details>(() => {
    const v: Details = [
      {
        name: "items.sold_to",
        text: item.value?.soldTo || "",
      },
      {
        name: "items.sold_price",
        text: String(item.value?.soldPrice) || "",
        type: "currency",
      },
      {
        name: "items.sold_at",
        text: item.value?.soldDate || "",
        type: "date",
        date: true,
      },
    ];

    if (!preferences.value.showEmpty) {
      return filterZeroValues(v);
    }

    return v;
  });

  function openImageDialog(img: Photo, itemId: string) {
    openDialog(DialogID.ItemImage, {
      params: {
        type: "preloaded",
        originalSrc: img.originalSrc,
        originalType: img.originalType,
        thumbnailSrc: img.thumbnailSrc,
        attachmentId: img.attachmentId,
        itemId,
      },
      onClose: result => {
        if (result?.action === "delete" && item.value?.id === itemId) {
          item.value.attachments = item.value.attachments.filter(a => a.id !== result.id);
        }
      },
    });
  }

  const currentUrl = computed(() => {
    return window.location.href;
  });

  const currentPath = computed(() => {
    return route.path;
  });

  const tabs = computed(() => {
    return [
      {
        id: "details",
        name: "global.details",
        to: `/item/${itemId.value}`,
      },
      {
        id: "log",
        name: "items.item_maintenance",
        to: `/item/${itemId.value}/maintenance`,
      },
      {
        id: "schedule",
        name: "items.collection_schedule",
        to: "/maintenance",
      },
      {
        id: "edit",
        name: "global.edit",
        to: `/item/${itemId.value}/edit`,
      },
    ];
  });

  async function refreshItemList() {
    const version = loadVersion;
    const id = item.value?.id;
    if (!id) return;
    const resp = await api.value.items.getAll({ parentIds: [id] });
    if (version !== loadVersion) return;
    if (resp.error) {
      items.value = [];
      return;
    }
    items.value = resp.data.items;
  }

  async function duplicateItem(settings?: DuplicateSettings) {
    if (!item.value) {
      return;
    }

    const duplicateSettings = settings
      ? {
          copyMaintenance: settings.copyMaintenance,
          copyAttachments: settings.copyAttachments,
          copyCustomFields: settings.copyCustomFields,
          copyPrefix: settings.copyPrefixOverride ?? t("items.duplicate.prefix"),
        }
      : {
          copyMaintenance: preferences.value.duplicateSettings.copyMaintenance,
          copyAttachments: preferences.value.duplicateSettings.copyAttachments,
          copyCustomFields: preferences.value.duplicateSettings.copyCustomFields,
          copyPrefix: preferences.value.duplicateSettings.copyPrefixOverride ?? t("items.duplicate.prefix"),
        };

    const { error, data } = await api.value.items.duplicate(itemId.value, duplicateSettings);

    if (error) {
      toast.error(t("items.toast.failed_duplicate_item"));
      return;
    }

    navigateTo(`/item/${data.id}`);
  }

  function handleDuplicateClick(event: MouseEvent) {
    if (event.shiftKey) {
      openDialog(DialogID.DuplicateTemporarySettings);
    } else {
      duplicateItem();
    }
  }

  const confirm = useConfirm();

  async function deleteItem() {
    const confirmed = await confirm.open(t("items.delete_item_confirm"));

    if (!confirmed.data) {
      return;
    }

    const { error } = await api.value.items.delete(itemId.value);
    if (error) {
      toast.error(t("items.toast.failed_delete_item"));
      return;
    }
    toast.success(t("items.toast.item_deleted"));
    navigateTo("/home");
  }

  async function saveAsTemplate() {
    if (!item.value) {
      return;
    }

    const NIL_UUID = "00000000-0000-0000-0000-000000000000";

    // Create template from item data
    const templateData = {
      name: `Template: ${item.value.name}`,
      description: "",
      notes: "",
      defaultName: item.value.name,
      defaultDescription: item.value.description || "",
      defaultQuantity: item.value.quantity,
      defaultInsured: item.value.insured,
      defaultManufacturer: item.value.manufacturer || "",
      defaultModelNumber: item.value.modelNumber || "",
      defaultLifetimeWarranty: item.value.lifetimeWarranty,
      defaultWarrantyDetails: item.value.warrantyDetails || "",
      defaultLocationId: item.value.location?.id || item.value.parent?.id || "",
      defaultTagIds: item.value.tags?.map(l => l.id) || [],
      includeWarrantyFields: !!(
        item.value.warrantyDetails ||
        item.value.lifetimeWarranty ||
        item.value.warrantyExpires
      ),
      includePurchaseFields: !!(item.value.purchaseFrom || item.value.purchasePrice || item.value.purchaseDate),
      includeSoldFields: !!(item.value.soldTo || item.value.soldPrice || item.value.soldDate),
      fields: item.value.fields.map(field => ({
        id: NIL_UUID,
        name: field.name,
        type: "text",
        textValue: field.textValue || "",
      })),
    };

    const { data, error } = await api.value.templates.create(templateData);
    if (error) {
      toast.error(t("components.template.toast.create_failed"));
      return;
    }

    toast.success(
      t("components.template.toast.saved_as_template", {
        name: templateData.name,
      })
    );
    navigateTo(`/template/${data.id}`);
  }

  async function createSubitem() {
    openDialog(DialogID.CreateEntity, {
      params: {
        baseType: "item",
        subItem: true,
      },
    });
  }
</script>

<template>
  <BaseContainer v-if="item">
    <!-- set page title -->
    <Title>{{ item.name }}</Title>

    <ItemImageDialog />
    <Dialog :dialog-id="DialogID.DuplicateTemporarySettings">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t("items.duplicate.temporary_title") }}</DialogTitle>
        </DialogHeader>
        <ItemDuplicateSettings v-model="temporaryDuplicateSettings" />
        <DialogFooter>
          <Button
            @click="
              closeDialog(DialogID.DuplicateTemporarySettings);
              duplicateItem(temporaryDuplicateSettings);
            "
          >
            {{ $t("global.duplicate") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <section>
      <NuxtLink to="/items" class="mb-4 inline-block text-primary underline">
        {{ $t("items.back_to_inventory") }}
      </NuxtLink>
      <Card class="p-3">
        <header :class="{ 'mb-2': item.description }">
          <div class="flex flex-wrap items-end gap-2">
            <div
              class="mb-auto flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            >
              <MdiPackageVariant class="size-7" />
            </div>
            <div>
              <Breadcrumb v-if="fullpath && fullpath.length > 0">
                <BreadcrumbList>
                  <BreadcrumbItem v-for="(part, idx) in fullpath" :key="part.id">
                    <BreadcrumbLink
                      v-if="idx < fullpath.length - 1"
                      as-child
                      class="text-foreground/70 hover:underline"
                    >
                      <NuxtLink :to="`/${part.type}/${part.id}`">
                        {{ part.name }}
                      </NuxtLink>
                    </BreadcrumbLink>
                    <template v-else>
                      {{ part.name }}
                    </template>
                    <BreadcrumbSeparator v-if="idx < fullpath.length - 1" :key="`sep-${part.id}`" />
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 class="text-wrap pb-1 font-serif text-4xl">
                {{ item ? item.name : "" }}
              </h1>
              <div class="flex flex-wrap gap-2 pb-1">
                <TagChip v-for="tag in itemTags" :key="tag.id" :tag="tag" size="sm" :ancestors="tag.ancestors" />
              </div>
              <div class="flex flex-wrap gap-1 text-wrap text-xs">
                <div>
                  {{ $t("items.created_at") }}
                  <DateTime :date="item?.createdAt" />
                </div>
                -
                <div>
                  {{ $t("items.updated_at") }}
                  <DateTime :date="item?.updatedAt" />
                </div>
              </div>
            </div>
            <div class="ml-auto mt-2 flex flex-wrap items-center justify-between gap-2">
              <LabelMaker
                v-if="typeof item.assetId === 'string' && item.assetId != ''"
                :id="item.assetId"
                type="asset"
              />
              <LabelMaker v-else :id="item.id" type="item" />
              <Button class="w-9 md:w-auto" :aria-label="$t('global.create_subitem')" @click="createSubitem">
                <MdiPlus />
                <span class="hidden md:inline">{{ $t("global.create_subitem") }}</span>
              </Button>

              <Button as-child>
                <NuxtLink :to="`/item/${item.id}/edit`">{{ $t("items.edit_item") }}</NuxtLink>
              </Button>

              <!-- More actions dropdown -->
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="outline" size="icon" :aria-label="$t('global.more_actions')">
                    <MdiDotsVertical class="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-48">
                  <DropdownMenuItem @click="handleDuplicateClick">
                    <MdiPlusBoxMultipleOutline class="mr-2 size-4" />
                    {{ $t("global.duplicate") }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="saveAsTemplate">
                    <MdiContentSaveEdit class="mr-2 size-4" />
                    {{ $t("components.template.save_as_template") }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteItem">
                    <MdiDelete class="mr-2 size-4" />
                    {{ $t("global.delete") }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
      </Card>

      <div class="mb-6 mt-3 flex flex-wrap items-center justify-between">
        <ButtonGroup>
          <Button
            v-for="tab in tabs"
            :key="tab.id"
            as-child
            :variant="tab.to === currentPath ? 'default' : 'outline'"
            size="sm"
          >
            <NuxtLink :to="tab.to">
              {{ $t(tab.name) }}
            </NuxtLink>
          </Button>
        </ButtonGroup>
      </div>
    </section>

    <section>
      <div class="space-y-6">
        <!-- this renders the other pages content -->
        <NuxtPage :item="item" :page-key="`${preferences.collectionId}:${itemId}:${route.path}`" />

        <!-- anything in this is not rendered if on another page -->
        <template v-if="!hasNested">
          <div class="flex flex-wrap items-center justify-end gap-4">
            <Label class="flex cursor-pointer items-center gap-2">
              <Switch v-model="preferences.showEmpty" />
              {{ $t("items.show_empty") }}
            </Label>
            <CopyText :text="currentUrl" :icon-size="16" />
          </div>
          <ItemDetails
            :item="item"
            :photos="photos"
            :show-empty="preferences.showEmpty"
            @photo="openImageDialog($event, item.id)"
          >
            <template #quantity="{ detail }">
              <div class="flex items-center">
                {{ detail.text }}
                <span
                  class="my-0 ml-4 inline-flex gap-2 opacity-10 transition-opacity duration-75 group-hover:opacity-100"
                >
                  <Button size="icon" variant="outline" class="size-8 rounded-full" @click="adjustQuantity(-1)">
                    <MdiMinus class="size-3" />
                  </Button>
                  <Button size="icon" variant="outline" class="size-8 rounded-full" @click="adjustQuantity(1)">
                    <MdiPlus class="size-3" />
                  </Button>
                </span>
              </div>
            </template>
          </ItemDetails>

          <BaseCard v-if="showAttachments" collapsable>
            <template #title> {{ $t("items.attachments") }} </template>
            <DetailsSection v-if="attachmentDetails.length > 0" :details="attachmentDetails">
              <template #manuals>
                <ItemAttachmentsList
                  v-if="attachments.manuals.length > 0"
                  :attachments="attachments.manuals"
                  :item-id="item.id"
                />
              </template>
              <template #attachments>
                <ItemAttachmentsList
                  v-if="attachments.attachments.length > 0"
                  :attachments="attachments.attachments"
                  :item-id="item.id"
                />
              </template>
              <template #warranty>
                <ItemAttachmentsList
                  v-if="attachments.warranty.length > 0"
                  :attachments="attachments.warranty"
                  :item-id="item.id"
                />
              </template>
              <template #receipts>
                <ItemAttachmentsList
                  v-if="attachments.receipts.length > 0"
                  :attachments="attachments.receipts"
                  :item-id="item.id"
                />
              </template>
            </DetailsSection>
            <div v-else>
              <p class="px-6 pb-4 text-foreground/70">
                {{ $t("items.no_attachments") }}
              </p>
            </div>
          </BaseCard>

          <BaseCard v-if="showWarranty" collapsable>
            <template #title> {{ $t("items.warranty_details") }} </template>
            <DetailsSection :details="warrantyDetails" />
          </BaseCard>

          <BaseCard v-if="showSold" collapsable>
            <template #title> {{ $t("items.sold_details") }} </template>
            <DetailsSection :details="soldDetails" />
          </BaseCard>
        </template>
      </div>
    </section>

    <section v-if="items && items.length > 0" class="mt-6">
      <ItemViewSelectable :items="items" @refresh="refreshItemList" />
    </section>
  </BaseContainer>
  <BaseContainer v-else>
    <p v-if="loading" role="status" class="p-6">{{ $t("global.loading") }}</p>
    <NuxtLink to="/items" class="inline-block p-6 text-primary underline">
      {{ $t("items.back_to_inventory") }}
    </NuxtLink>
    <div v-if="failed" role="alert" class="space-y-4 p-6">
      <p>{{ $t("items.unavailable") }}</p>
      <Button variant="outline" @click="refresh">{{ $t("global.retry") }}</Button>
    </div>
  </BaseContainer>
</template>

<style lang="css" scoped>
  /* Style dialog background */
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }
</style>
