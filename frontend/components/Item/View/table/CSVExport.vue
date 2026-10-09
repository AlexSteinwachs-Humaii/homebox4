<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import Button from "~/components/ui/button/Button.vue";
  import MdiLoading from "~icons/mdi/loading";
  import type { ItemsQuery } from "~/lib/api/classes/items";
  import { makeCSVPresentation } from "~/lib/reporting-csv";
  import { useCSVExport } from "~/composables/use-csv-export";

  const props = defineProps<{ query: ItemsQuery; columns: string[] }>();
  const { t } = useI18n();
  const currency = await useFormatCurrency();
  const { loading, failed, run } = useCSVExport();

  function exportCSV() {
    void run(signal => {
      const presentation = makeCSVPresentation(
        props.columns,
        t,
        currency,
        date => fmtDate(date, "short"),
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      return useUserApi().reports.filteredCSV(props.query, presentation, signal);
    });
  }
</script>

<template>
  <div class="flex flex-col gap-1">
    <Button variant="outline" :disabled="loading" :aria-busy="loading" @click="exportCSV">
      <MdiLoading v-if="loading" class="animate-spin" />
      {{ loading ? t("reports.csv_export.exporting") : t("reports.csv_export.action") }}
    </Button>
    <p class="text-xs text-muted-foreground">
      {{ t("reports.csv_export.scope") }}
    </p>
    <p v-if="failed" role="alert" class="text-sm text-destructive">
      {{ t("reports.csv_export.error") }}
    </p>
  </div>
</template>
