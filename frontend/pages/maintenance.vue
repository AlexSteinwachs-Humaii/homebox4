<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import BaseContainer from "@/components/Base/Container.vue";
  import BaseSectionHeader from "@/components/Base/SectionHeader.vue";
  import MaintenanceScheduleView from "~/components/Maintenance/ScheduleView.vue";

  const { t } = useI18n();

  definePageMeta({
    middleware: ["auth"],
  });
  useHead({
    title: "HomeBox | " + t("menu.maintenance"),
  });
</script>

<template>
  <div>
    <BaseContainer class="flex flex-col gap-4">
      <BaseSectionHeader>
        {{ $t("menu.maintenance") }}
        <template #description>{{ $t("maintenance.schedule.description") }}</template>
      </BaseSectionHeader>
      <MaintenanceScheduleView />
    </BaseContainer>
  </div>
</template>
