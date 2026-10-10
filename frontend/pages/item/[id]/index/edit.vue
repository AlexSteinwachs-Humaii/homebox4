<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import { toast } from "@/components/ui/sonner";
  import type { ItemAttachment, EntityFieldData, EntityOut } from "~~/lib/api/types/data-contracts";
  import { AttachmentTypes } from "~~/lib/api/types/non-generated";
  import { useTagStore } from "~/stores/tags";
  import MdiLoading from "~icons/mdi/loading";
  import MdiDelete from "~icons/mdi/delete";
  import MdiPencil from "~icons/mdi/pencil";
  import MdiContentSaveOutline from "~icons/mdi/content-save-outline";
  import MdiImageOutline from "~icons/mdi/image-outline";
  import MdiOpenInNew from "~icons/mdi/open-in-new";
  import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { useDialog } from "@/components/ui/dialog-provider";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  import { Switch } from "@/components/ui/switch";
  import { Label } from "@/components/ui/label";
  import { DialogID } from "~/components/ui/dialog-provider/utils";
  import FormTextField from "~/components/Form/TextField.vue";
  import FormTextArea from "~/components/Form/TextArea.vue";
  import MarkdownEditor from "~/components/Form/MarkdownEditor.vue";
  import FormDatePicker from "~/components/Form/DatePicker.vue";
  import FormCheckbox from "~/components/Form/Checkbox.vue";
  import LocationSelector from "~/components/Location/Selector.vue";
  import ItemSelector from "~/components/Item/Selector.vue";
  import TagSelector from "~/components/Tag/Selector.vue";
  import BaseCard from "@/components/Base/Card.vue";
  import { Card } from "~/components/ui/card";
  import DropZone from "~/components/global/DropZone.vue";
  import EntitySelector from "~/components/Entity/Selector.vue";
  import { useEntityTypeStore } from "~/stores/entityTypes";
  import { scopedResource } from "~/lib/data/scoped-resource";
  import Feedback from "~/components/WarmHabitat/Feedback.vue";
  import ItemContext from "~/components/WarmHabitat/ItemContext.vue";
  import { fmtDate, useFormatCurrency } from "~/composables/use-formatters";
  import { editUpdate, validateEdit } from "~/lib/items/item-edit";

  const { t } = useI18n();

  const { openDialog, closeDialog } = useDialog();

  definePageMeta({
    middleware: ["auth"],
  });

  const route = useRoute();
  const api = useUserApi();
  const preferences = useViewPreferences();

  const entityTypeStore = useEntityTypeStore();

  const itemId = computed<string>(() => route.params.id as string);

  const tagStore = useTagStore();
  const tags = computed(() => tagStore.tags);

  const parent = ref();
  const location = ref();
  const item = ref<EntityOut & { tagIds: string[] }>(null as never);
  const loadedItem = ref<EntityOut | null>(null);
  let editGeneration = 0;
  onBeforeUnmount(() => editGeneration++);
  const saving = ref(false);

  const saveError = ref("");
  const validationErrors = ref<string[]>([]);
  // Attachments have separate APIs; queue their writes until Save as well.
  const attachmentChanges: {
    title: string;
    run: (client: typeof api, id: string) => Promise<{ error: unknown; status?: number }>;
  }[] = reactive([]);

  const scope = computed(() =>
    preferences.value.collectionId ? `${preferences.value.collectionId}:${itemId.value}` : null
  );
  watch(
    scope,
    () => {
      editGeneration++;
      saveError.value = "";
      validationErrors.value = [];
      attachmentChanges.length = 0;
      item.value = null as never;
      loadedItem.value = null;
      parent.value = null;
      location.value = null;
    },
    { flush: "sync" }
  );

  const resource = scopedResource(scope, async () => {
    const { data, error } = await useUserApi().items.get(itemId.value);
    if (error || !data || data.id !== itemId.value) throw new Error("Unable to load item");
    return data;
  });

  watch(
    resource.data,
    data => {
      // Initialize once per scope: refreshes must not overwrite an unsaved draft.
      if (!data || data.id !== itemId.value || item.value) return;
      const snapshot = structuredClone(toRaw(data));
      loadedItem.value = snapshot;
      item.value = {
        ...structuredClone(snapshot),
        tagIds: snapshot.tags.map(tag => tag.id),
      };
      parent.value = snapshot.parent?.entityType && !snapshot.parent.entityType.isLocation ? snapshot.parent : null;
      // Keep the derived location separate from the actual parent item.
      location.value = snapshot.location ?? (snapshot.parent?.entityType?.isLocation ? snapshot.parent : null);
    },
    { immediate: true }
  );

  const formatCurrency = await useFormatCurrency();

  async function saveItem(redirect: boolean) {
    if (saving.value || !item.value || !loadedItem.value || !scope.value) return;
    const parentId = parent.value?.id || location.value?.id || null;
    validationErrors.value = validateEdit(item.value, parentId);
    saveError.value = "";
    if (validationErrors.value.length) return;

    const requestScope = scope.value;
    const generation = editGeneration;
    const id = loadedItem.value.id;
    const client = useUserApi(); // Freeze the authorized collection for this submission.
    const current = () => generation === editGeneration && scope.value === requestScope && !!item.value;
    const converting = item.value.entityType?.id !== loadedItem.value.entityType?.id;
    const isLocation = item.value.entityType?.isLocation;
    const payload = editUpdate(item.value, id, parentId);
    saving.value = true;
    let entitySaved = false;
    try {
      if (converting && isLocation) {
        const { isCanceled } = await confirm.open(t("items.edit.change_entity_type_confirm"));
        if (isCanceled || !current()) return;
      }
      const result = await client.items.update(id, payload);
      if (!current()) return;
      if (result.error || result.data?.id !== id) {
        saveError.value = t([400, 422].includes(result.status) ? "edit_form.save_rejected" : "edit_form.save_failed", {
          status: result.status,
        });
        return;
      }
      entitySaved = true;
      // Remove only completed operations: a failed attachment retains the remaining draft.
      while (attachmentChanges.length && current()) {
        const change = attachmentChanges[0]!;
        const result = await change.run(client, id);
        if (!current()) return;
        if (result.error) {
          saveError.value =
            result.status === 413
              ? `${t("items.toast.attachment_too_large")} ${t("edit_form.attachments_failed")}`
              : t("edit_form.attachments_failed");
          return;
        }
        attachmentChanges.shift();
      }
      if (!current()) return;
      if (!redirect) {
        const refreshed = await client.items.get(id);
        if (!current()) return;
        if (!refreshed.error && refreshed.data?.id === id) {
          loadedItem.value = structuredClone(refreshed.data);
          item.value.attachments = structuredClone(refreshed.data.attachments);
        }
      }
      toast.success(t("items.toast.item_saved"));
      if (isLocation) await navigateTo(`/location/${id}`);
      else if (redirect) await navigateTo(`/item/${id}`);
    } catch {
      if (current())
        saveError.value = t(entitySaved ? "edit_form.attachments_failed" : "edit_form.save_failed", { status: "—" });
    } finally {
      saving.value = false;
    }
  }

  type NonNullableStringKeys<T> = Extract<keyof T, keyof { [K in keyof T as T[K] extends string ? K : never]: any }>;
  type NonNullableNumberKeys<T> = Extract<keyof T, keyof { [K in keyof T as T[K] extends number ? K : never]: any }>;
  type BooleanKeys<T> = Extract<keyof T, keyof { [K in keyof T as T[K] extends boolean ? K : never]: any }>;
  type DateKeys<T> = Extract<keyof T, keyof { [K in keyof T as T[K] extends Date | string ? K : never]: any }>;

  type TextFormField = {
    type: "text" | "textarea" | "markdown";
    label: string;
    ref: NonNullableStringKeys<EntityOut>;
    maxLength?: number;
    minLength?: number;
  };

  type NumberFormField = {
    type: "number";
    label: string;
    ref: NonNullableNumberKeys<EntityOut> | NonNullableStringKeys<EntityOut>;
    min?: number;
  };

  interface BoolFormField {
    type: "checkbox";
    label: string;
    ref: BooleanKeys<EntityOut>;
  }

  type DateFormField = {
    type: "date";
    label: string;
    ref: DateKeys<EntityOut>;
  };

  type FormField = TextFormField | BoolFormField | DateFormField | NumberFormField;

  const mainFields: FormField[] = [
    {
      type: "text",
      label: "items.name",
      ref: "name",
      maxLength: 255,
      minLength: 1,
    },
    {
      type: "number",
      label: "items.quantity",
      ref: "quantity",
      min: 0,
    },
    {
      type: "markdown",
      label: "items.description",
      ref: "description",
      maxLength: 1000,
    },
    {
      type: "text",
      label: "items.manufacturer",
      ref: "manufacturer",
      maxLength: 255,
    },
    {
      type: "text",
      label: "items.model_number",
      ref: "modelNumber",
      maxLength: 255,
    },
    {
      type: "text",
      label: "items.serial_number",
      ref: "serialNumber",
      maxLength: 255,
    },
    {
      type: "checkbox",
      label: "items.insured",
      ref: "insured",
    },
    {
      type: "markdown",
      label: "items.notes",
      ref: "notes",
      maxLength: 1000,
    },
    {
      type: "checkbox",
      label: "items.archived",
      ref: "archived",
    },
    {
      type: "text",
      label: "items.asset_id",
      ref: "assetId",
    },
  ];

  const purchaseFields: FormField[] = [
    {
      type: "text",
      label: "items.purchased_from",
      ref: "purchaseFrom",
      maxLength: 255,
    },
    {
      type: "number",
      label: "items.purchase_price",
      ref: "purchasePrice",
    },
    {
      type: "date",
      label: "items.purchase_date",
      ref: "purchaseDate",
    },
  ];

  const warrantyFields: FormField[] = [
    {
      type: "checkbox",
      label: "items.lifetime_warranty",
      ref: "lifetimeWarranty",
    },
    {
      type: "date",
      label: "items.warranty_expires",
      ref: "warrantyExpires",
    },
    {
      type: "textarea",
      label: "items.warranty_details",
      ref: "warrantyDetails",
      maxLength: 1000,
    },
  ];

  const soldFields: FormField[] = [
    {
      type: "text",
      label: "items.sold_to",
      ref: "soldTo",
      maxLength: 255,
    },
    {
      type: "number",
      label: "items.sold_price",
      ref: "soldPrice",
    },
    {
      type: "date",
      label: "items.sold_at",
      ref: "soldDate",
    },
  ];

  // - Attachments
  const attDropZone = ref<HTMLDivElement>();
  const { isOverDropZone: attDropZoneActive } = useDropZone(attDropZone);

  const refAttachmentInput = ref<HTMLInputElement>();

  function clickUpload() {
    if (!refAttachmentInput.value) {
      return;
    }
    refAttachmentInput.value.click();
  }

  function uploadImage(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !files.item(0)) {
      return;
    }

    const first = files.item(0);
    if (!first) {
      return;
    }

    uploadAttachment([first], null);
  }

  const dropPhoto = (files: File[] | null) => uploadAttachment(files, AttachmentTypes.Photo);
  const dropAttachment = (files: File[] | null) => uploadAttachment(files, AttachmentTypes.Attachment);
  const dropWarranty = (files: File[] | null) => uploadAttachment(files, AttachmentTypes.Warranty);
  const dropManual = (files: File[] | null) => uploadAttachment(files, AttachmentTypes.Manual);
  const dropReceipt = (files: File[] | null) => uploadAttachment(files, AttachmentTypes.Receipt);

  function getDroppedURL(event: DragEvent): string {
    const dt = event.dataTransfer;
    if (!dt) return "";

    const mozUrl = dt.getData("text/x-moz-url").split("\n")[0]?.trim() || "";
    const uriList = dt
      .getData("text/uri-list")
      .split("\n")
      .find(u => u.trim() && !u.startsWith("#"))
      ?.trim();

    return (mozUrl || uriList || dt.getData("text/plain").trim()).trim();
  }

  function isValidHttpURL(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function fallbackLinkTitle(value: string): string {
    try {
      const parsed = new URL(value);
      return parsed.hostname + parsed.pathname;
    } catch {
      return value;
    }
  }

  async function handleAttachmentCardDrop(event: DragEvent) {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (!dt) return;

    if (dt.files && dt.files.length > 0) {
      return;
    }

    const droppedURL = getDroppedURL(event);
    if (!droppedURL) return;

    if (!isValidHttpURL(droppedURL)) {
      toast.error(t("items.toast.failed_upload_attachment"));
      return;
    }

    const targetEl = event.target as Element | null;
    const zoneEl = targetEl?.closest("[data-link-type]");
    const attachmentType = zoneEl?.getAttribute("data-link-type") || "attachment";

    const title = fallbackLinkTitle(droppedURL);
    if (saving.value) return;
    attachmentChanges.push({
      title,
      run: (client, id) => client.items.attachments.addExternalLink(id, "link", droppedURL, title, attachmentType),
    });
  }

  async function uploadAttachment(files: File[] | null, type: AttachmentTypes | null) {
    if (!files || files.length === 0 || !files[0]) {
      return;
    }

    if (saving.value) return;
    for (const file of files) {
      attachmentChanges.push({
        title: file.name,
        run: (client, id) => client.items.attachments.add(id, file, file.name, type),
      });
    }
  }

  const confirm = useConfirm();

  async function deleteAttachment(attachmentId: string) {
    const generation = editGeneration;
    const confirmed = await confirm.open(t("items.delete_attachment_confirm"));

    if (confirmed.isCanceled) {
      return;
    }

    if (saving.value || !item.value || generation !== editGeneration) return;
    const attachment = item.value.attachments.find(a => a.id === attachmentId);
    attachmentChanges.push({
      title: attachment?.title || attachmentId,
      run: (client, id) => client.items.attachments.delete(id, attachmentId),
    });
    item.value.attachments = item.value.attachments.filter(a => a.id !== attachmentId);
  }

  const editState = reactive({
    loading: false,

    // Values
    obj: {},
    id: "",
    title: "",
    type: "",
    primary: false,
  });

  const attachmentOpts = Object.entries(AttachmentTypes).map(([key, value]) => ({
    text: key[0]!.toUpperCase() + key.slice(1),
    value,
  }));

  function openAttachmentEditDialog(attachment: ItemAttachment) {
    editState.id = attachment.id;
    editState.title = attachment.title;
    editState.type = attachment.type;
    editState.primary = attachment.primary;
    openDialog(DialogID.AttachmentEdit);

    editState.obj = attachmentOpts.find(o => o.value === attachment.type) || attachmentOpts[0]!;
  }

  function updateAttachment() {
    if (saving.value || !item.value) return;
    const attachmentId = editState.id;
    const change = {
      title: editState.title,
      type: editState.type,
      primary: editState.primary,
    };
    attachmentChanges.push({
      title: change.title,
      run: (client, id) => client.items.attachments.update(id, attachmentId, change),
    });
    const attachment = item.value.attachments.find(a => a.id === attachmentId);
    if (attachment) Object.assign(attachment, change);
    closeDialog(DialogID.AttachmentEdit);

    editState.id = "";
    editState.title = "";
    editState.type = "";
  }

  function addField() {
    item.value.fields.push({
      id: null,
      name: "Field Name",
      type: "text",
      textValue: "",
      numberValue: 0,
      booleanValue: false,
      timeValue: null,
    } as unknown as EntityFieldData);
  }

  const { query, results, isLoading, triggerSearch } = useItemSearch(api, {
    immediate: false,
  });

  async function keyboardSave(e: KeyboardEvent) {
    // Cmd + S
    if (e.metaKey && e.key === "s") {
      e.preventDefault();
      await saveItem(!e.shiftKey);
    }

    // Ctrl + S
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      await saveItem(!e.shiftKey);
    }
  }

  async function maybeSyncWithParentLocation() {
    if (parent.value && parent.value.id) {
      const generation = editGeneration;
      const { data, error } = await useUserApi().items.get(parent.value.id);
      if (generation !== editGeneration || !item.value) return;

      if (error) {
        toast.error(t("items.toast.error_loading_parent_data"));
        return;
      }

      // The item now lives inside the parent item, so its location follows
      // the parent's derived location — reflect that in the selector instead
      // of showing the parent item itself as the "location" (#1589).
      location.value = data.location ?? (data.parent?.entityType?.isLocation ? data.parent : null);
      if (data.syncChildEntityLocations) {
        toast.info(t("items.toast.sync_child_location"));
      }
    }
  }

  function onLocationChanged() {
    // Picking a location explicitly moves the item there: clear any selected
    // parent item so the chosen location actually takes effect on save.
    if (parent.value && parent.value.id) {
      parent.value = null;
      toast.info(t("items.toast.child_location_desync"));
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", keyboardSave);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", keyboardSave);
  });
</script>

<template>
  <Feedback v-if="resource.error.value" :title="t('items.toast.failed_load_item')" />
  <div v-else-if="!item" class="py-8" role="status">
    {{ $t("capture.loading") }}
  </div>
  <div v-else class="space-y-6 pb-8">
    <ItemContext :title="t('edit_form.title', { name: loadedItem?.name })" :description="t('edit_form.subtitle')">
      <template #breadcrumb>
        <NuxtLink
          :to="`/item/${loadedItem!.id}`"
          class="text-sm text-link underline"
          @click="saving && $event.preventDefault()"
          >{{ t("edit_form.back") }}</NuxtLink
        >
      </template>
    </ItemContext>
    <Dialog :dialog-id="DialogID.AttachmentEdit">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t("items.edit.edit_attachment_dialog.title") }}</DialogTitle>
        </DialogHeader>

        <FormTextField v-model="editState.title" :label="$t('items.edit.edit_attachment_dialog.attachment_title')" />
        <div>
          <Label for="attachment-type">
            {{ $t("items.edit.edit_attachment_dialog.attachment_type") }}
          </Label>
          <Select id="attachment-type" v-model:model-value="editState.type">
            <SelectTrigger>
              <SelectValue :placeholder="$t('items.edit.edit_attachment_dialog.select_type')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in attachmentOpts" :key="opt.value" :value="opt.value">
                {{ opt.text }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div v-if="editState.type == 'photo'" class="mt-3 flex items-center gap-2">
          <Checkbox
            id="primary"
            v-model="editState.primary"
            :label="$t('items.edit.edit_attachment_dialog.primary_photo')"
          />
          <label class="cursor-pointer text-sm" for="primary">
            <span class="font-semibold">{{ $t("items.edit.edit_attachment_dialog.primary_photo") }}</span>
            {{ $t("items.edit.edit_attachment_dialog.primary_photo_sub") }}
          </label>
        </div>

        <DialogFooter>
          <Button :disabled="editState.loading || saving" @click="updateAttachment">
            <MdiLoading v-if="editState.loading" class="animate-spin" />
            {{ $t("global.update") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <section class="relative">
      <div
        class="sticky z-10 my-4 flex items-center justify-between gap-2"
        :class="{
          'top-[calc(var(--header-height-mobile)+0.25rem)] sm:top-[calc(var(--header-height)+0.25rem)]':
            !preferences.displayLegacyHeader,
          'top-1': preferences.displayLegacyHeader,
        }"
      >
        <TooltipProvider :delay-duration="0">
          <Tooltip>
            <TooltipTrigger as-child>
              <Label class="flex cursor-pointer items-center gap-2 backdrop-blur-sm">
                <Switch v-model="preferences.editorAdvancedView" />
                {{ $t("items.advanced") }}
              </Label>
            </TooltipTrigger>
            <TooltipContent>{{ $t("items.show_advanced_view_options") }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" :disabled="saving" @click="navigateTo(`/item/${loadedItem!.id}`)">
          {{ $t("global.cancel") }}
        </Button>
        <Button size="sm" :disabled="saving" @click="saveItem(true)">
          <MdiLoading v-if="saving" class="animate-spin" />
          <MdiContentSaveOutline v-else />
          {{ $t("global.save") }}
        </Button>
      </div>
      <div
        v-if="saveError || validationErrors.length"
        role="alert"
        class="mb-4 rounded-md border border-destructive p-4"
      >
        <p v-if="saveError">{{ saveError }}</p>
        <ul v-if="validationErrors.length" class="list-inside list-disc">
          <li v-for="field in validationErrors" :key="field">
            {{ t(`edit_form.validation.${field}`) }}
          </li>
        </ul>
      </div>
      <fieldset
        v-if="!resource.pending.value"
        :disabled="saving"
        class="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>div:not(:first-child)]:lg:col-span-2"
      >
        <BaseCard class="overflow-visible">
          <template #title> {{ $t("capture.item_information") }} </template>
          <div class="border-t p-5">
            <FormTextField
              v-model="item.name"
              :label="t('capture.name_required')"
              :required="true"
              :min-length="1"
              :max-length="255"
            />
          </div>
          <div class="mb-6 grid gap-4 px-5 pt-2 md:grid-cols-2">
            <LocationSelector v-model="location" @update:model-value="onLocationChanged()" />
            <ItemSelector
              v-model="parent"
              v-model:search="query"
              :items="results"
              item-text="name"
              :label="$t('items.parent_item')"
              no-results-text="Type to search..."
              :exclude-items="[item]"
              :is-loading="isLoading"
              :trigger-search="triggerSearch"
              @update:model-value="maybeSyncWithParentLocation()"
            />
            <div class="flex flex-col gap-2">
              <Label for="edit-sync-child-locations" class="px-1">{{ $t("items.sync_child_locations") }}</Label>
              <Switch id="edit-sync-child-locations" v-model="item.syncChildEntityLocations" />
            </div>
            <TagSelector v-model="item.tagIds" :tags="tags" />
            <div class="flex flex-col gap-1">
              <Label class="px-1">{{ $t("global.entity_type") }}</Label>
              <EntitySelector
                :entity-types="entityTypeStore.allTypes"
                :selected-entity-type="item.entityType?.id"
                @entity-type-changed="id => (item.entityType = entityTypeStore.findById(id))"
              />
            </div>
          </div>

          <div class="grid gap-5 border-t p-5 sm:grid-cols-2">
            <div
              v-for="field in mainFields.filter(field => field.ref !== 'name')"
              :key="field.ref"
              :class="['name', 'description', 'notes'].includes(field.ref) ? 'sm:col-span-2' : ''"
            >
              <div>
                <FormTextArea
                  v-if="field.type === 'textarea'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <MarkdownEditor
                  v-else-if="field.type === 'markdown'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'text'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  type="text"
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'number'"
                  v-model.number="item[field.ref]"
                  type="number"
                  step="any"
                  :min="field.min"
                  :label="$t(field.label)"
                />
                <FormDatePicker v-else-if="field.type === 'date'" v-model="item[field.ref]" :label="$t(field.label)" />
                <FormCheckbox
                  v-else-if="field.type === 'checkbox'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                />
              </div>
            </div>
          </div>
        </BaseCard>

        <aside
          v-if="loadedItem"
          class="space-y-6 lg:col-start-2 lg:row-start-1"
          :aria-label="t('edit_form.purchase_context')"
        >
          <Card class="p-6">
            <p class="font-semibold">{{ loadedItem.name }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ $t("items.asset_id") }}: {{ loadedItem.assetId }}</p>
            <h2 class="habitat-heading mt-6 text-2xl">
              {{ t("edit_form.purchase_context") }}
            </h2>
            <p class="mt-2 text-sm text-muted-foreground">
              {{ t("edit_form.context_note") }}
            </p>
            <dl class="mt-4 divide-y">
              <div class="flex justify-between gap-3 py-4">
                <dt>{{ t("items.purchase_price") }}</dt>
                <dd class="font-semibold">
                  {{ formatCurrency(loadedItem.purchasePrice) }}
                </dd>
              </div>
              <div class="flex justify-between gap-3 py-4">
                <dt>{{ t("items.purchase_date") }}</dt>
                <dd class="font-semibold">
                  {{ loadedItem.purchaseDate ? fmtDate(loadedItem.purchaseDate) : t("edit_form.not_recorded") }}
                </dd>
              </div>
              <div class="flex justify-between gap-3 py-4">
                <dt>{{ t("items.archived") }}</dt>
                <dd class="font-semibold">
                  {{ loadedItem.archived ? t("global.yes") : t("global.no") }}
                </dd>
              </div>
            </dl>
          </Card>
        </aside>

        <BaseCard v-if="preferences.editorAdvancedView">
          <template #title> {{ $t("items.custom_fields") }} </template>
          <div class="space-y-4 divide-y border-t px-5">
            <div
              v-for="(field, idx) in item.fields"
              :key="`field-${idx}`"
              class="grid grid-cols-2 gap-2 pt-4 md:grid-cols-4"
            >
              <!-- <FormSelect v-model:value="field.type" label="Field Type" :items="fieldTypes" value-key="value" /> -->
              <FormTextField v-model="field.name" :label="$t('global.name')" />
              <div class="col-span-3 flex items-end">
                <FormTextField v-model="field.textValue" :label="$t('global.value')" :max-length="500" />
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button size="icon" variant="destructive" class="ml-2" @click="item.fields.splice(idx, 1)">
                      <MdiDelete />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ $t("global.delete") }}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
          <div class="mt-4 flex justify-end px-5 pb-4">
            <Button size="sm" @click="addField">
              {{ $t("global.add") }}
            </Button>
          </div>
        </BaseCard>

        <Card
          ref="attDropZone"
          class="overflow-visible shadow-xl"
          @dragover.prevent
          @drop.prevent="handleAttachmentCardDrop"
        >
          <div class="px-4 py-5 sm:px-6">
            <h3 class="text-lg font-medium leading-6">
              {{ $t("items.attachments") }}
            </h3>
            <p class="text-xs">
              {{ $t("items.changes_persisted_immediately") }}
            </p>
          </div>
          <div class="border-t p-4">
            <div v-if="attDropZoneActive" class="grid grid-cols-4 gap-4">
              <DropZone data-link-type="photo" @drop="dropPhoto">
                {{ $t("items.photos") }}
              </DropZone>
              <DropZone data-link-type="warranty" @drop="dropWarranty">
                {{ $t("items.warranty") }}
              </DropZone>
              <DropZone data-link-type="manual" @drop="dropManual">
                {{ $t("items.manuals") }}
              </DropZone>
              <DropZone data-link-type="attachment" @drop="dropAttachment">
                {{ $t("items.attachments") }}
              </DropZone>
              <DropZone data-link-type="receipt" @drop="dropReceipt">
                {{ $t("items.receipts") }}
              </DropZone>
            </div>
            <button
              v-else
              data-link-type="attachment"
              class="grid h-24 w-full place-content-center border-2 border-dashed border-primary"
              @click="clickUpload"
            >
              <input ref="refAttachmentInput" hidden type="file" @change="uploadImage" />
              <p>{{ $t("items.drag_and_drop") }}</p>
            </button>
          </div>

          <div class="border-t p-4">
            <div v-if="attachmentChanges.length" class="mb-4" role="status">
              <p>{{ t("edit_form.pending_attachments") }}</p>
              <ul class="list-inside list-disc">
                <li v-for="(change, index) in attachmentChanges" :key="index">
                  {{ change.title }}
                </li>
              </ul>
            </div>
            <ul role="list" class="divide-y rounded-md border">
              <li
                v-for="attachment in item.attachments"
                :key="attachment.id"
                class="grid grid-cols-6 justify-between py-3 pl-3 pr-4 text-sm"
              >
                <p class="col-span-4 my-auto">
                  {{ attachment.title }}
                </p>
                <p class="my-auto">
                  {{ $t(`items.${attachment.type}`) }}
                </p>
                <div class="flex justify-end gap-2">
                  <Tooltip v-if="attachment.type === 'photo'">
                    <TooltipTrigger as-child>
                      <Button
                        variant="outline"
                        size="icon"
                        @click="
                          openDialog(DialogID.ItemImage, {
                            params: {
                              type: 'attachment',
                              itemId: item.id,
                              attachmentId: attachment.id,
                              thumbnailId: attachment.thumbnail?.id,
                              mimeType: attachment.mimeType,
                              readOnly: true,
                            },
                            onClose: result => {
                              if (result?.action === 'delete') {
                                item.attachments = item.attachments.filter(a => a.id !== result.id);
                              }
                            },
                          })
                        "
                      >
                        <MdiImageOutline />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t("items.edit.view_image") }}</TooltipContent>
                  </Tooltip>
                  <Tooltip
                    v-if="
                      attachment.mimeType === 'link/url' ||
                      (attachment.path ?? '').startsWith('http://') ||
                      (attachment.path ?? '').startsWith('https://')
                    "
                  >
                    <TooltipTrigger as-child>
                      <a :href="attachment.path" target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="icon">
                          <MdiOpenInNew />
                        </Button>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      {{ $t("components.item.attachments_list.open_new_tab") }}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button variant="destructive" size="icon" @click="deleteAttachment(attachment.id)">
                        <MdiDelete />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t("global.delete") }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="icon" @click="openAttachmentEditDialog(attachment)">
                        <MdiPencil />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t("global.edit") }}</TooltipContent>
                  </Tooltip>
                </div>
              </li>
            </ul>
          </div>
        </Card>

        <Card v-if="preferences.editorAdvancedView" class="overflow-visible shadow-xl">
          <div class="px-4 py-5 sm:px-6">
            <h3 class="text-lg font-medium leading-6">
              {{ $t("items.purchase_details") }}
            </h3>
          </div>
          <div class="border-t sm:p-0">
            <div v-for="field in purchaseFields" :key="field.ref" class="grid grid-cols-1 sm:divide-y">
              <div class="border-b px-4 pb-4 pt-2 sm:px-6">
                <FormTextArea
                  v-if="field.type === 'textarea'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'text'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'number'"
                  v-model.number="item[field.ref]"
                  type="number"
                  step="any"
                  :min="field.min"
                  :label="$t(field.label)"
                  inline
                />
                <FormDatePicker
                  v-else-if="field.type === 'date'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
                <FormCheckbox
                  v-else-if="field.type === 'checkbox'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
              </div>
            </div>
          </div>
        </Card>

        <Card v-if="preferences.editorAdvancedView" class="overflow-visible shadow-xl">
          <div class="px-4 py-5 sm:px-6">
            <h3 class="text-lg font-medium leading-6">
              {{ $t("items.warranty_details") }}
            </h3>
          </div>
          <div class="border-t sm:p-0">
            <div v-for="field in warrantyFields" :key="field.ref" class="grid grid-cols-1 sm:divide-y">
              <div class="border-b px-4 pb-4 pt-2 sm:px-6">
                <FormTextArea
                  v-if="field.type === 'textarea'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'text'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'number'"
                  v-model.number="item[field.ref]"
                  type="number"
                  step="any"
                  :min="field.min"
                  :label="$t(field.label)"
                  inline
                />
                <FormDatePicker
                  v-else-if="field.type === 'date'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
                <FormCheckbox
                  v-else-if="field.type === 'checkbox'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
              </div>
            </div>
          </div>
        </Card>

        <Card v-if="preferences.editorAdvancedView" class="overflow-visible shadow-xl">
          <div class="px-4 py-5 sm:px-6">
            <h3 class="text-lg font-medium leading-6">
              {{ $t("items.sold_details") }}
            </h3>
          </div>
          <div class="border-t sm:p-0">
            <div v-for="field in soldFields" :key="field.ref" class="grid grid-cols-1 sm:divide-y">
              <div class="border-b px-4 pb-4 pt-2 sm:px-6">
                <FormTextArea
                  v-if="field.type === 'textarea'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'text'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                  :max-length="field.maxLength"
                  :min-length="field.minLength"
                />
                <FormTextField
                  v-else-if="field.type === 'number'"
                  v-model.number="item[field.ref]"
                  type="number"
                  step="any"
                  :min="field.min"
                  :label="$t(field.label)"
                  inline
                />
                <FormDatePicker
                  v-else-if="field.type === 'date'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
                <FormCheckbox
                  v-else-if="field.type === 'checkbox'"
                  v-model="item[field.ref]"
                  :label="$t(field.label)"
                  inline
                />
              </div>
            </div>
          </div>
        </Card>
      </fieldset>
    </section>
  </div>
</template>
