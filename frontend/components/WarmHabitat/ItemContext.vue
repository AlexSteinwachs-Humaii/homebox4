<script setup lang="ts">
  defineProps<{ title: string; description?: string }>();
</script>

<template>
  <header class="habitat-context">
    <div class="min-w-0 space-y-2">
      <slot name="breadcrumb" />
      <h1 class="habitat-heading text-4xl">{{ title }}</h1>
      <p v-if="description" class="text-sm text-muted-foreground">
        {{ description }}
      </p>
      <slot name="metadata" />
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
