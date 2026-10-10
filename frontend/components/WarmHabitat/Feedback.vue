<script setup lang="ts">
  import { CircleCheck, CircleAlert, Info } from "lucide-vue-next";
  import Panel from "./Panel.vue";

  withDefaults(defineProps<{ title: string; tone?: "success" | "error" | "info" }>(), { tone: "info" });
</script>

<template>
  <Panel class="habitat-feedback" :role="tone === 'error' ? 'alert' : 'status'" aria-atomic="true">
    <CircleCheck v-if="tone === 'success'" class="mt-1 size-5 shrink-0" aria-hidden="true" />
    <CircleAlert v-else-if="tone === 'error'" class="mt-1 size-5 shrink-0 text-destructive" aria-hidden="true" />
    <Info v-else class="mt-1 size-5 shrink-0" aria-hidden="true" />
    <div class="min-w-0 space-y-2">
      <h2 class="habitat-heading">{{ title }}</h2>
      <div class="text-sm text-muted-foreground"><slot /></div>
      <div v-if="$slots.actions" class="flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </div>
  </Panel>
</template>
