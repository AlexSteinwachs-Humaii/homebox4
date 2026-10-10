<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import EntitySelector from "~/components/Entity/Selector.vue";
  import LocationSelector from "~/components/Location/Selector.vue";
  import TagSelector from "~/components/Tag/Selector.vue";
  import TextField from "~/components/Form/TextField.vue";
  import TextArea from "~/components/Form/TextArea.vue";
  import DatePicker from "~/components/Form/DatePicker.vue";
  import Checkbox from "~/components/Form/Checkbox.vue";
  import { Label } from "~/components/ui/label";
  import type { EntityTypeSummary, TagOut } from "~/lib/api/types/data-contracts";
  import type { FlatTreeItem } from "~/composables/use-location-helpers";
  import type { ItemFormData } from "~/lib/items/item-form";

  const { t } = useI18n();
  const typeId = useId();
  const form = defineModel<ItemFormData>({ required: true });
  defineProps<{
    types: EntityTypeSummary[];
    locations: FlatTreeItem[];
    tags: TagOut[];
    currency: string;
  }>();
</script>

<template>
  <div class="space-y-6">
    <TextField
      v-model="form.name"
      :label="t('capture.name_required')"
      :required="true"
      :min-length="1"
      :max-length="255"
    />
    <div class="space-y-1.5">
      <Label :for="typeId">{{ t("capture.type_required") }}</Label>
      <EntitySelector
        :id="typeId"
        :entity-types="types.filter(type => !type.isLocation)"
        :selected-entity-type="form.entityTypeId"
        :on-entity-type-changed="id => (form.entityTypeId = id)"
      />
    </div>
    <div class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-1">
        <LocationSelector v-model="form.location" :locations="locations" />
        <p class="px-1 text-xs text-muted-foreground">
          {{ t("capture.location_required") }}
        </p>
      </div>
      <TextField
        v-model="form.quantity"
        :label="t('global.quantity')"
        type="number"
        :min="0"
        step="any"
        :required="true"
      />
    </div>
    <TextArea v-model="form.description" :label="t('items.description')" :max-length="1000" />
    <TagSelector v-model="form.tagIds" :tags="tags" :allow-create="false" />
    <section class="space-y-5 border-t pt-5" :aria-label="t('items.purchase_details')">
      <h3 class="habitat-heading text-2xl">
        {{ t("items.purchase_details") }}
        <span class="font-sans text-xs text-muted-foreground">{{ t("capture.optional") }}</span>
      </h3>
      <div class="grid gap-5 sm:grid-cols-2">
        <TextField
          v-model="form.purchasePrice"
          :label="currency ? t('capture.price_currency', { currency }) : t('items.purchase_price')"
          type="number"
          :min="0"
          step="any"
        />
        <DatePicker v-model="form.purchaseDate" :label="t('items.purchase_date')" />
      </div>
      <TextField v-model="form.purchaseFrom" :label="t('items.purchased_from')" :max-length="255" />
      <Checkbox v-model="form.insured" :label="t('global.insured')" />
    </section>
  </div>
</template>
