<script setup lang="ts">
  import { ref, watch } from "vue";
  import { Package } from "lucide-vue-next";

  const props = defineProps<{
    src?: string;
    name: string;
    fallbackLabel: string;
  }>();
  const failed = ref(false);
  watch(
    () => props.src,
    () => (failed.value = false)
  );
</script>

<template>
  <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      class="size-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <span v-else role="img" :aria-label="`${name}: ${fallbackLabel}`" :title="fallbackLabel">
      <Package class="size-6 text-muted-foreground" aria-hidden="true" />
    </span>
  </div>
</template>
