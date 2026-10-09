<script setup lang="ts">
  defineProps<{ title: string; description?: string }>();
</script>

<template>
  <fieldset class="habitat-panel habitat-form-group">
    <legend class="habitat-heading px-2">{{ title }}</legend>
    <p v-if="description" class="text-sm text-muted-foreground">
      {{ description }}
    </p>
    <slot />
  </fieldset>
</template>
