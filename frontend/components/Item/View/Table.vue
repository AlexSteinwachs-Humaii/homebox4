<script setup lang="ts">
  import { computed } from "vue";
  import type { EntitySummary } from "~/lib/api/types/data-contracts";
  import DataTable from "./table/data-table.vue";
  import { makeColumns } from "./table/columns";
  import { useI18n } from "vue-i18n";

  defineProps<{
    items: EntitySummary[];
    requiredVisibleColumns?: string[];
  }>();

  const { t } = useI18n();

  const columns = computed(() => makeColumns({ t }).filter(c => c.enableHiding !== false));
</script>

<template>
  <DataTable
    view="table"
    :data="items"
    :columns="columns"
    :required-visible-columns="requiredVisibleColumns"
    disable-controls
  />
</template>
