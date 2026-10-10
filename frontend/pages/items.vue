<script setup lang="ts">
  import InventoryPage from "~/components/WarmHabitat/InventoryPage.vue";

  definePageMeta({ middleware: ["auth"] });
  const route = useRoute();
</script>

<template>
  <!-- Do not mount Inventory (or its requests) behind a nested capture surface. -->
  <InventoryPage v-if="route.path.replace(/\/$/, '') === '/items'" />
  <NuxtPage v-else />
</template>
