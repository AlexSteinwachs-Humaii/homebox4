<script setup lang="ts">
  import type { EntityOffboardingRecord } from "@/lib/api/types/data-contracts";
  import BaseCard from "@/components/Base/Card.vue";
  import DateTime from "@/components/global/DateTime.vue";
  defineProps<{ records: EntityOffboardingRecord[]; offboarded: boolean }>();
</script>

<template>
  <BaseCard>
    <template #title>{{ $t("items.lifecycle.history") }}</template>
    <div class="space-y-4 px-6 pb-4">
      <p role="status" class="font-medium">
        {{ $t(offboarded ? "items.lifecycle.offboarded" : "items.lifecycle.active") }}
      </p>
      <ol class="space-y-4">
        <li v-for="record in records" :key="record.id" class="space-y-2 break-words border-t pt-4">
          <p class="font-medium">
            {{ $t(`items.lifecycle.outcomes.${record.outcome}`) }} —
            {{ record.effectiveDate }}
          </p>
          <p v-if="record.customReason">{{ record.customReason }}</p>
          <p v-if="record.notes" class="whitespace-pre-wrap">
            {{ record.notes }}
          </p>
          <p v-if="record.reactivatedAt" class="text-sm text-muted-foreground">
            {{ $t("items.lifecycle.reactivated") }}:
            <DateTime :date="record.reactivatedAt" format="long" />
          </p>
        </li>
      </ol>
    </div>
  </BaseCard>
</template>
