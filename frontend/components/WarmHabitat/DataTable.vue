<script setup lang="ts">
  import { Table, TableCaption } from "~/components/ui/table";
  import Panel from "./Panel.vue";

  defineProps<{ caption: string }>();
</script>

<template>
  <Panel class="overflow-hidden">
    <Table class="habitat-table">
      <TableCaption class="sr-only">{{ caption }}</TableCaption>
      <slot />
    </Table>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Panel>
</template>
