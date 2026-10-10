import type { LocationQuery, LocationQueryRaw } from "vue-router";
import type { ItemsQuery } from "~/lib/api/classes/items";

export const queryDefaults = {
  q: "",
  page: 1,
  orderBy: "name",
  archived: false,
  fieldSelector: false,
  negateTags: false,
  onlyWithoutPhoto: false,
  onlyWithPhoto: false,
  loc: [] as string[],
  tag: [] as string[],
  fields: [] as string[],
};
export function parseInventoryQuery(query: LocationQuery) {
  const first = (key: string) => (Array.isArray(query[key]) ? query[key][0] : query[key]);
  const list = (key: string) => [query[key] ?? []].flat().filter((v): v is string => typeof v === "string");
  const page = Number(first("page"));
  return {
    q: first("q") || "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    orderBy: ["name", "createdAt", "updatedAt"].includes(first("orderBy") || "") ? first("orderBy")! : "name",
    archived: first("archived") === "true",
    fieldSelector: first("fieldSelector") === "true",
    negateTags: first("negateTags") === "true",
    onlyWithoutPhoto: first("onlyWithoutPhoto") === "true",
    onlyWithPhoto: first("onlyWithPhoto") === "true",
    loc: list("loc"),
    tag: list("tag"),
    fields: list("fields"),
  };
}
export function inventoryApiQuery(state: ReturnType<typeof parseInventoryQuery>, pageSize: number): ItemsQuery {
  return {
    q: state.q,
    page: state.page,
    pageSize,
    orderBy: state.orderBy,
    includeArchived: state.archived,
    parentIds: state.loc,
    tags: state.tag,
    negateTags: state.negateTags,
    onlyWithoutPhoto: state.onlyWithoutPhoto,
    onlyWithPhoto: state.onlyWithPhoto,
    fields: state.fields,
  };
}

export function cleanInventoryQuery(query: Record<string, LocationQueryRaw[string] | boolean>): LocationQueryRaw {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([key, value]) => {
        const defaultValue = queryDefaults[key as keyof typeof queryDefaults];
        return JSON.stringify(value) !== JSON.stringify(defaultValue);
      })
      .map(([key, value]) => [key, typeof value === "boolean" ? String(value) : value])
  );
}
