<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import type { AnyDetail, Details } from "~~/components/global/DetailsSection/types";
  import { filterZeroValues } from "~~/components/global/DetailsSection/types";
  import type { ItemAttachment } from "~~/lib/api/types/data-contracts";
  import MdiPackageVariant from "~icons/mdi/package-variant";
  import MdiPlus from "~icons/mdi/plus";
  import MdiPencil from "~icons/mdi/pencil";
  import MdiDelete from "~icons/mdi/delete";
  import { useDialog } from "@/components/ui/dialog-provider";
  import { Card } from "@/components/ui/card";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
  } from "@/components/ui/breadcrumb";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Separator } from "@/components/ui/separator";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import BaseCard from "@/components/Base/Card.vue";
  import Currency from "~/components/global/Currency.vue";
  import DateTime from "~/components/global/DateTime.vue";
  import LabelMaker from "~/components/global/LabelMaker.vue";
  import Markdown from "~/components/global/Markdown.vue";
  import DetailsSection from "~/components/global/DetailsSection/DetailsSection.vue";
  import BaseSectionHeader from "@/components/Base/SectionHeader.vue";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import InventoryIdentity from "~/components/Item/View/table/inventory-identity.vue";
  import { useLocationContents } from "~/composables/use-location-contents";
  import ItemAttachmentsList from "~/components/Item/AttachmentsList.vue";
  import ItemImageDialog from "~/components/Item/ImageDialog.vue";
  import LocationCard from "~/components/Location/Card.vue";
  import TagChip from "~/components/Tag/Chip.vue";

  definePageMeta({
    middleware: ["auth"],
  });

  const { t } = useI18n();

  const { openDialog } = useDialog();

  const route = useRoute();
  const preferences = useViewPreferences();
  const { selectedCollection } = useCollections();
  const api = computed(() => {
    void preferences.value.collectionId;
    return useUserApi();
  });
  const locationId = computed<string>(() => route.params.id as string);
  const collectionId = computed(() => preferences.value.collectionId);
  const pageSize = computed(() => preferences.value.itemsPerTablePage || 12);
  const {
    location,
    items,
    fullpath,
    total,
    page,
    loading,
    failed,
    unavailable,
    refresh: refreshItemList,
  } = useLocationContents(collectionId, locationId, pageSize, () => api.value.items);
  const childPlaces = computed(() => location.value?.children?.filter(child => child.entityType?.isLocation) || []);

  const confirm = useConfirm();

  async function confirmDelete() {
    const { isCanceled } = await confirm.open(t("locations.location_items_delete_confirm"));
    if (isCanceled) {
      return;
    }

    const { error } = await api.value.items.deleteLocation(locationId.value);
    if (error) {
      toast.error(t("locations.toast.failed_delete_location"));
      return;
    }

    toast.success(t("locations.toast.location_deleted"));
    navigateTo("/locations");
  }

  function openCreateItem() {
    openDialog(DialogID.CreateEntity, {
      params: {
        baseType: "item",
      },
    });
  }

  function goToEdit() {
    navigateTo(`/location/${locationId.value}/edit`);
  }

  // Photos
  type Photo = {
    thumbnailSrc?: string;
    originalSrc: string;
    attachmentId: string;
    originalType?: string;
  };

  const photos = computed<Photo[]>(() => {
    if (!location.value?.attachments) {
      return [];
    }
    return location.value.attachments.reduce((acc, cur) => {
      if (cur.type === "photo") {
        const photo: Photo = {
          originalSrc: api.value.authURL(`/entities/${location.value!.id}/attachments/${cur.id}`),
          originalType: cur.mimeType,
          attachmentId: cur.id,
        };
        if (cur.thumbnail) {
          photo.thumbnailSrc = api.value.authURL(`/entities/${location.value!.id}/attachments/${cur.thumbnail.id}`);
        } else {
          photo.thumbnailSrc = photo.originalSrc;
        }
        acc.push(photo);
      }
      return acc;
    }, [] as Photo[]);
  });

  function openImageDialog(img: Photo, entityId: string) {
    openDialog(DialogID.ItemImage, {
      params: {
        type: "preloaded",
        originalSrc: img.originalSrc,
        originalType: img.originalType,
        thumbnailSrc: img.thumbnailSrc,
        attachmentId: img.attachmentId,
        itemId: entityId,
      },
      onClose: result => {
        if (result?.action === "delete") {
          location.value!.attachments = location.value!.attachments.filter(a => a.id !== result.id);
        }
      },
    });
  }

  // Attachments (non-photo)
  const nonPhotoAttachments = computed(() => {
    if (!location.value?.attachments) {
      return { attachments: [], warranty: [], manuals: [], receipts: [] };
    }
    return location.value.attachments.reduce(
      (acc, attachment) => {
        if (attachment.type === "photo") return acc;
        if (attachment.type === "warranty") acc.warranty.push(attachment);
        else if (attachment.type === "manual") acc.manuals.push(attachment);
        else if (attachment.type === "receipt") acc.receipts.push(attachment);
        else acc.attachments.push(attachment);
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

  const hasNonPhotoAttachments = computed(() => {
    const a = nonPhotoAttachments.value;
    return a.attachments.length > 0 || a.warranty.length > 0 || a.manuals.length > 0 || a.receipts.length > 0;
  });

  // Details
  const locationDetails = computed<Details>(() => {
    if (!location.value) {
      return [];
    }

    const ret: Details = [
      {
        name: "items.notes",
        type: "markdown",
        text: location.value.notes,
      },
      ...(location.value.fields || []).map(field => {
        return {
          name: field.name,
          text: field.textValue,
        } as AnyDetail;
      }),
    ];

    if (!preferences.value.showEmpty) {
      return filterZeroValues(ret);
    }

    return ret;
  });
</script>

<template>
  <div>
    <ItemImageDialog />

    <NuxtLink to="/locations" class="mb-4 inline-block text-sm text-primary hover:underline">
      {{ $t("locations.contents.back") }}
    </NuxtLink>
    <p class="mb-4 text-sm text-muted-foreground">
      {{ selectedCollection?.name }}
    </p>
    <BaseCard v-if="loading" class="p-6" role="status">{{ $t("locations.loading") }}</BaseCard>
    <BaseCard v-else-if="failed" class="p-6" role="alert">
      <p>{{ $t("locations.toast.failed_load_location") }}</p>
      <Button class="mt-3" variant="outline" @click="refreshItemList">{{ $t("locations.retry") }}</Button>
    </BaseCard>
    <BaseCard v-else-if="unavailable" class="p-6" role="alert">{{ $t("locations.contents.unavailable") }}</BaseCard>
    <BaseCard v-else-if="!collectionId" class="p-6" role="status">{{
      $t("locations.contents.select_collection")
    }}</BaseCard>
    <div v-else-if="location">
      <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="break-words font-serif text-4xl">{{ location.name }}</h1>
          <Markdown v-if="location.description" class="mt-2 text-muted-foreground" :source="location.description" />
        </div>
        <Button as-child>
          <NuxtLink to="/items">{{ $t("home.view_inventory") }}</NuxtLink>
        </Button>
      </header>
      <div class="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Panel>
          <template #header
            ><h2 class="font-serif text-2xl">
              {{ $t("locations.contents.trail") }}
            </h2></template
          >
          <ol class="space-y-3 p-6">
            <li v-for="entry in fullpath" :key="entry.id" class="break-words text-sm">
              <span v-if="entry.id === locationId" aria-current="page" class="font-semibold">{{ entry.name }}</span>
              <NuxtLink
                v-else
                :to="`/${entry.type === 'location' ? 'location' : 'item'}/${entry.id}`"
                class="text-primary hover:underline"
              >
                {{ entry.name }}
              </NuxtLink>
            </li>
            <li v-if="!fullpath.some(entry => entry.id === locationId)" class="font-semibold">
              {{ location.name }}
            </li>
          </ol>
          <div v-if="childPlaces.length" class="border-t p-6">
            <h3 class="mb-3 font-semibold">
              {{ $t("locations.child_locations") }}
            </h3>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li v-for="child in childPlaces" :key="child.id">
                <NuxtLink :to="`/location/${child.id}`" class="text-primary hover:underline">
                  {{ child.name }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </Panel>
        <Panel class="min-w-0">
          <template #header>
            <h2 class="font-serif text-2xl">
              {{ $t("locations.contents.title") }}
            </h2>
            <Badge variant="secondary">{{ $t("locations.contents.scope") }}</Badge>
          </template>
          <nav :aria-label="$t('locations.child_locations')" class="flex flex-wrap gap-2 border-b p-4">
            <Button variant="secondary" aria-current="page" @click="page = 1">{{
              $t("locations.contents.this_location")
            }}</Button>
            <Button v-for="child in childPlaces" :key="child.id" as-child variant="outline">
              <NuxtLink :to="`/location/${child.id}`">{{ child.name }}</NuxtLink>
            </Button>
          </nav>
          <p class="border-b p-4 text-sm text-muted-foreground">
            {{ $t("locations.contents.scope_help") }}
          </p>
          <p v-if="total === 0" class="p-6" role="status">
            {{ $t("locations.contents.empty") }}
          </p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b bg-muted text-muted-foreground">
                <tr>
                  <th class="p-4">{{ $t("items.name") }}</th>
                  <th class="p-4">
                    {{ $t("locations.contents.local_context") }}
                  </th>
                  <th class="p-4">{{ $t("items.quantity") }}</th>
                  <th class="p-4">{{ $t("inventory.unit_price") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in items" :key="item.id" class="border-b">
                  <td class="p-4">
                    <NuxtLink
                      :to="`/${item.entityType?.isLocation ? 'location' : 'item'}/${item.id}`"
                      class="hover:underline"
                    >
                      <InventoryIdentity :item="item" />
                    </NuxtLink>
                  </td>
                  <td class="p-4">
                    {{ location.name }}<span v-if="item.entityType?.isLocation"> · {{ $t("menu.locations") }}</span>
                  </td>
                  <td class="p-4">
                    {{ item.entityType?.isLocation ? "—" : item.quantity }}
                  </td>
                  <td class="p-4">
                    <Currency v-if="!item.entityType?.isLocation" :amount="item.purchasePrice" /><span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <template #footer>
            <p class="text-sm text-muted-foreground">
              {{ $t("locations.contents.total", { total }) }}
            </p>
            <div v-if="total > 0" class="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="outline" :disabled="page <= 1" @click="page--">{{
                $t("locations.contents.previous")
              }}</Button>
              <span class="text-sm">{{
                $t("items.pages", {
                  page,
                  totalPages: Math.ceil(total / pageSize),
                })
              }}</span>
              <Button variant="outline" :disabled="page * pageSize >= total" @click="page++">{{
                $t("locations.contents.next")
              }}</Button>
            </div>
          </template>
        </Panel>
      </div>
      <details class="mt-6">
        <summary class="cursor-pointer py-3 font-semibold">
          {{ $t("locations.contents.details") }}
        </summary>
        <!-- set page title -->
        <Title>{{ location.name }}</Title>

        <!-- Photo gallery -->
        <section v-if="photos.length > 0" class="mb-4">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            <button
              v-for="(photo, i) in photos"
              :key="i"
              class="group relative aspect-1 h-32 overflow-hidden rounded-lg border bg-muted"
              @click="openImageDialog(photo, location.id)"
            >
              <img
                :src="photo.thumbnailSrc || photo.originalSrc"
                :alt="location.name"
                class="size-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            </button>
          </div>
        </section>

        <Card class="p-3">
          <header :class="{ 'mb-2': location?.description }">
            <div class="flex flex-wrap items-end gap-2">
              <div
                class="mb-auto flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <MdiPackageVariant class="size-7" />
              </div>
              <div>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink as-child>
                        <NuxtLink to="/locations">{{ $t("menu.locations") }}</NuxtLink>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <template v-for="entry in fullpath.filter(entry => entry.id !== locationId)" :key="entry.id">
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink as-child class="text-foreground/70 hover:underline">
                          <NuxtLink :to="`/${entry.type === 'location' ? 'location' : 'item'}/${entry.id}`">
                            {{ entry.name }}
                          </NuxtLink>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </template>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>{{ location.name }}</BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <h2 class="flex items-center gap-3 pb-1 text-2xl">
                  {{ location ? location.name : "" }}

                  <Badge v-if="location && location.totalPrice" variant="secondary">
                    <Currency :amount="location.totalPrice" />
                  </Badge>
                </h2>
                <div class="flex flex-wrap gap-1 text-xs">
                  <div>
                    {{ $t("global.created") }}
                    <DateTime :date="location?.createdAt" />
                  </div>
                </div>
                <div v-if="location.tags && location.tags.length > 0" class="mt-2 flex flex-wrap gap-1">
                  <TagChip v-for="tag in location.tags" :key="tag.id" :tag="tag" size="sm" />
                </div>
              </div>
              <div class="ml-auto mt-2 flex flex-wrap items-center justify-between gap-2">
                <LabelMaker :id="location.id" type="location" />
                <Button class="w-9 md:w-auto" @click="openCreateItem">
                  <MdiPlus name="mdi-plus" />
                  <span class="hidden md:inline">
                    {{ $t("components.location.create_item") }}
                  </span>
                </Button>
                <Button class="w-9 md:w-auto" @click="goToEdit">
                  <MdiPencil name="mdi-pencil" />
                  <span class="hidden md:inline">
                    {{ $t("global.edit") }}
                  </span>
                </Button>
                <Button variant="destructive" class="w-9 md:w-auto" @click="confirmDelete()">
                  <MdiDelete name="mdi-delete" />
                  <span class="hidden md:inline">
                    {{ $t("global.delete") }}
                  </span>
                </Button>
              </div>
            </div>
          </header>
          <Separator v-if="location && location.description" />
          <Markdown v-if="location && location.description" class="mt-3 text-base" :source="location.description" />
        </Card>

        <!-- Details (notes, custom fields) -->
        <BaseCard v-if="locationDetails.length > 0" class="mt-4">
          <template #title> {{ $t("global.details") }} </template>
          <DetailsSection :details="locationDetails" />
        </BaseCard>

        <!-- Attachments (non-photo) -->
        <BaseCard v-if="hasNonPhotoAttachments" class="mt-4">
          <template #title> {{ $t("items.attachments") }} </template>
          <div class="border-t px-4 py-2">
            <ItemAttachmentsList
              v-if="nonPhotoAttachments.attachments.length > 0"
              :attachments="nonPhotoAttachments.attachments"
              :item-id="location.id"
            />
            <ItemAttachmentsList
              v-if="nonPhotoAttachments.warranty.length > 0"
              :attachments="nonPhotoAttachments.warranty"
              :item-id="location.id"
            />
            <ItemAttachmentsList
              v-if="nonPhotoAttachments.manuals.length > 0"
              :attachments="nonPhotoAttachments.manuals"
              :item-id="location.id"
            />
            <ItemAttachmentsList
              v-if="nonPhotoAttachments.receipts.length > 0"
              :attachments="nonPhotoAttachments.receipts"
              :item-id="location.id"
            />
          </div>
        </BaseCard>
      </details>

      <!-- Child locations -->
      <section v-if="childPlaces.length > 0" class="mt-6">
        <BaseSectionHeader class="mb-5">
          {{ $t("locations.child_locations") }}
        </BaseSectionHeader>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <LocationCard v-for="child in childPlaces" :key="child.id" :location="child" />
        </div>
      </section>
    </div>
  </div>
</template>
