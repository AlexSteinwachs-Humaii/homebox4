<script setup lang="ts">
  import Feedback from "./Feedback.vue";
  import type { EntityOut } from "~/lib/api/types/data-contracts";

  defineProps<{ item: EntityOut }>();
</script>

<template>
  <Feedback tone="success" :title="$t('capture.saved_title')" :aria-label="$t('capture.saved_title')" class="mb-6">
    {{ $t("capture.saved_message", { name: item.name }) }}
  </Feedback>
</template>
