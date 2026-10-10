<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { Button } from "@/components/ui/button";
  import BaseContainer from "@/components/Base/Container.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
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
  <BaseContainer class="space-y-6">
    <ItemContext :title="t('menu.maintenance')" :description="t('maintenance.schedule.description')">
      <template #actions>
        <Button as-child>
          <NuxtLink to="/items">{{ t("maintenance.schedule.view_inventory") }}</NuxtLink>
        </Button>
      </template>
    </ItemContext>
    <MaintenanceScheduleView />
  </BaseContainer>
</template>
