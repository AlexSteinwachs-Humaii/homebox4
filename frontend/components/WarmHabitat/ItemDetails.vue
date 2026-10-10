<script setup lang="ts">
  import { Package } from "lucide-vue-next";
  import type { EntityOut } from "~/lib/api/types/data-contracts";
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import DetailsSection from "~/components/global/DetailsSection/DetailsSection.vue";
  import Markdown from "~/components/global/Markdown.vue";
  import { itemSpecificationDetails, itemPurchaseDetails } from "~/lib/item-details";

  export type ItemPhoto = {
    thumbnailSrc?: string;
    originalSrc: string;
    attachmentId: string;
    originalType?: string;
  };

  const props = defineProps<{
    item: EntityOut;
    photos: ItemPhoto[];
    showEmpty: boolean;
  }>();
  defineEmits<{ photo: [photo: ItemPhoto] }>();
  const failedPhotos = ref<string[]>([]);
  watch(
    () => props.photos,
    () => (failedPhotos.value = [])
  );
  const availablePhotos = computed(() =>
    props.photos.filter(photo => !failedPhotos.value.includes(photo.attachmentId))
  );
  const details = computed(() => itemSpecificationDetails(props.item, props.showEmpty));
  const purchase = computed(() => itemPurchaseDetails(props.item, props.showEmpty));
</script>

<template>
  <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
    <div class="min-w-0 space-y-6">
      <Panel>
        <div v-if="availablePhotos.length" class="flex flex-wrap justify-center gap-2 p-4">
          <button
            v-for="photo in availablePhotos"
            :key="photo.attachmentId"
            class="overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="$t('items.photo') + ': ' + item.name"
            @click="$emit('photo', photo)"
          >
            <img
              :src="photo.thumbnailSrc || photo.originalSrc"
              :alt="item.name"
              class="max-h-80 w-full object-contain"
              loading="lazy"
              @error="failedPhotos.push(photo.attachmentId)"
            />
          </button>
        </div>
        <div
          v-else
          class="flex min-h-72 flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-muted-foreground"
        >
          <Package class="size-16" aria-hidden="true" />
          <p>{{ $t("home.no_photo") }}</p>
        </div>
      </Panel>
      <Panel>
        <template #header
          ><h2 class="font-serif text-2xl">
            {{ $t("items.about_item") }}
          </h2></template
        >
        <div class="break-words p-6">
          <Markdown v-if="item.description" :source="item.description" />
          <p v-else class="text-muted-foreground">
            {{ $t("items.no_description") }}
          </p>
        </div>
      </Panel>
    </div>
    <div class="min-w-0 space-y-6">
      <Panel>
        <template #header
          ><h2 class="font-serif text-2xl">
            {{ $t("items.details") }}
          </h2></template
        >
        <DetailsSection :details="details">
          <template #quantity="{ detail }"
            ><slot name="quantity" :detail="detail">{{ detail.text }}</slot></template
          >
          <template #insured>{{ $t(item.insured ? "global.yes" : "global.no") }}</template>
          <template #archived>{{ $t(item.archived ? "global.yes" : "global.no") }}</template>
        </DetailsSection>
      </Panel>
      <Panel>
        <template #header
          ><h2 class="font-serif text-2xl">
            {{ $t("items.purchase_details") }}
          </h2></template
        >
        <DetailsSection v-if="purchase.length" :details="purchase" />
        <p v-else class="p-6 text-muted-foreground">
          {{ $t("items.no_purchase_details") }}
        </p>
      </Panel>
    </div>
  </div>
</template>
