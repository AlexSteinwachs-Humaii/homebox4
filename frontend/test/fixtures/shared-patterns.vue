<script setup lang="ts">
  import Panel from "~/components/WarmHabitat/Panel.vue";
  import FormGroup from "~/components/WarmHabitat/FormGroup.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
  import Feedback from "~/components/WarmHabitat/Feedback.vue";
  import DataTable from "~/components/WarmHabitat/DataTable.vue";
  import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/table";
  import { Input } from "~/components/ui/input";
  import { Button } from "~/components/ui/button";
  import ThemePicker from "~/components/App/ThemePicker.vue";

  definePageMeta({ middleware: ["auth"] });
</script>

<template>
  <main class="min-w-0 space-y-6 p-4">
    <ItemContext title="Shared accessibility fixture" description="Representative shared patterns, not household data.">
      <template #actions>
        <Button as-child><a href="#patterns">Save example</a></Button>
        <Button variant="destructive">Delete example</Button>
      </template>
    </ItemContext>
    <Panel id="patterns" class="p-4">
      <a class="habitat-link" href="#example-name">Edit example</a>
      <FormGroup title="Example details" description="Every input needs its own label.">
        <label for="example-name">Example name</label>
        <Input id="example-name" placeholder="Name" />
        <Button variant="link">Help with example</Button>
      </FormGroup>
    </Panel>
    <Feedback title="Example saved" tone="success">Your example was saved.</Feedback>
    <Feedback title="Example could not be saved" tone="error">Enter a name and try again.</Feedback>
    <DataTable caption="Example inventory">
      <TableHeader
        ><TableRow><TableHead>Name</TableHead><TableHead>Location</TableHead></TableRow></TableHeader
      >
      <TableBody
        ><TableRow
          ><TableCell class="whitespace-nowrap"
            >A deliberately long example inventory entry for scroll testing</TableCell
          ><TableCell class="whitespace-nowrap">Example location with a long name</TableCell></TableRow
        ></TableBody
      >
    </DataTable>
    <ThemePicker />
  </main>
</template>
