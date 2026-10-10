<script setup lang="ts">
  import type { EntitySummary } from "~/lib/api/types/data-contracts";
  import Thumbnail from "~/components/WarmHabitat/Thumbnail.vue";
  const props = defineProps<{ item: EntitySummary }>();
  const api = useUserApi();
  const imageUrl = computed(() => {
    const attachment = props.item.thumbnailId || props.item.imageId;
    return attachment ? api.authURL(`/entities/${props.item.id}/attachments/${attachment}`) : undefined;
  });
</script>

<template>
  <div class="flex min-w-48 items-center gap-3">
    <Thumbnail :src="imageUrl" :name="item.name" :fallback-label="$t('home.no_photo')" />
    <div class="min-w-0">
      <span class="font-semibold">{{ item.name }}</span>
      <p class="text-xs text-muted-foreground">
        {{ item.assetId }}<span v-for="tag in item.tags" :key="tag.id"> · {{ tag.name }}</span>
      </p>
    </div>
  </div>
</template>
