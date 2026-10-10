<script setup lang="ts">
  import { Card } from "~/components/ui/card";
</script>

<template>
  <Card class="habitat-panel">
    <header v-if="$slots.header" class="flex flex-wrap items-center justify-between gap-3 border-b p-6">
      <slot name="header" />
    </header>
    <slot />
    <footer v-if="$slots.footer" class="border-t p-6">
      <slot name="footer" />
    </footer>
  </Card>
</template>
