<script setup lang="ts">
  import { DialogRoot } from "reka-ui";
  import { useI18n } from "vue-i18n";
  import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";
  import { Label } from "@/components/ui/label";
  import { offboardingOutcomes, offboardingValidation } from "@/lib/items/offboarding";
  import { toDateOnlyString } from "@/lib/datelib/dateOnly";
  import type { EntityOffboardRequest } from "@/lib/api/types/data-contracts";

  const props = defineProps<{
    open: boolean;
    itemId: string;
    offboarded: boolean;
  }>();
  const emit = defineEmits<{ "update:open": [boolean]; saved: [] }>();
  const { t } = useI18n();
  const api = useUserApi();
  const pending = ref(false);
  const error = ref("");
  const form = reactive<EntityOffboardRequest>({
    outcome: "sold",
    effectiveDate: "",
    customReason: "",
    notes: "",
  });
  watch(
    () => props.open,
    open => {
      if (open) {
        Object.assign(form, {
          outcome: "sold",
          effectiveDate: toDateOnlyString(new Date()),
          customReason: "",
          notes: "",
        });
        error.value = "";
      }
    }
  );
  function close(open: boolean) {
    if (!pending.value) emit("update:open", open);
  }
  async function submit() {
    if (pending.value) return;
    error.value = "";
    const validation = props.offboarded ? null : offboardingValidation(form);
    if (validation) {
      error.value = t(`items.lifecycle.${validation}`);
      return;
    }
    pending.value = true;
    try {
      const response = props.offboarded
        ? await api.items.reactivate(props.itemId)
        : await api.items.offboard(props.itemId, {
            ...form,
            customReason: form.outcome === "custom" ? form.customReason.trim() : "",
          });
      if (response.error) {
        error.value = t("items.lifecycle.failed");
        return;
      }
      emit("saved");
      emit("update:open", false);
    } catch {
      error.value = t("items.lifecycle.failed");
    } finally {
      pending.value = false;
    }
  }
</script>

<template>
  <DialogRoot :open="open" @update:open="close">
    <DialogContent
      :disable-close="pending"
      class="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto"
      @escape-key-down="pending && $event.preventDefault()"
      @interact-outside="pending && $event.preventDefault()"
    >
      <DialogHeader>
        <DialogTitle>{{ $t(offboarded ? "items.lifecycle.reactivate" : "items.lifecycle.offboard") }}</DialogTitle>
        <DialogDescription>{{
          $t(offboarded ? "items.lifecycle.reactivate_help" : "items.lifecycle.offboard_help")
        }}</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" novalidate :aria-busy="pending" @submit.prevent="submit">
        <fieldset v-if="!offboarded" :disabled="pending" class="space-y-4">
          <div class="space-y-2">
            <Label for="offboarding-outcome">{{ $t("items.lifecycle.outcome") }}</Label>
            <select
              id="offboarding-outcome"
              v-model="form.outcome"
              class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option v-for="outcome in offboardingOutcomes" :key="outcome" :value="outcome">
                {{ $t(`items.lifecycle.outcomes.${outcome}`) }}
              </option>
            </select>
          </div>
          <div v-if="form.outcome === 'custom'" class="space-y-2">
            <Label for="offboarding-reason">{{ $t("items.lifecycle.reason") }}</Label>
            <Input id="offboarding-reason" v-model="form.customReason" maxlength="255" required />
          </div>
          <div class="space-y-2">
            <Label for="offboarding-date">{{ $t("items.lifecycle.date") }}</Label>
            <Input id="offboarding-date" v-model="form.effectiveDate" type="date" required />
          </div>
          <div class="space-y-2">
            <Label for="offboarding-notes">{{ $t("items.lifecycle.notes") }}</Label>
            <Textarea id="offboarding-notes" v-model="form.notes" maxlength="1000" />
          </div>
        </fieldset>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" :disabled="pending" @click="close(false)">{{
            $t("global.cancel")
          }}</Button>
          <Button type="submit" :disabled="pending">{{
            $t(
              pending
                ? "items.lifecycle.saving"
                : offboarded
                  ? "items.lifecycle.reactivate"
                  : "items.lifecycle.offboard"
            )
          }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </DialogRoot>
</template>
