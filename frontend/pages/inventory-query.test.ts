import { describe, expect, it } from "vitest";
import { cleanInventoryQuery, inventoryApiQuery, parseInventoryQuery, queryDefaults } from "./inventory-query";

describe("Inventory URL and API semantics", () => {
  it("parses booleans rather than treating false strings as truthy; validates pages and sort", () => {
    expect(
      parseInventoryQuery({ archived: "false", onlyWithPhoto: "true", page: "-2", orderBy: "garbage" })
    ).toMatchObject({ archived: false, onlyWithPhoto: true, page: 1, orderBy: "name" });
    for (const page of ["NaN", "2.2", "Infinity", "0"]) expect(parseInventoryQuery({ page }).page).toBe(1);
  });
  it("reloads single and multiple filters, fields and pagination without changing API predicates", () => {
    const state = parseInventoryQuery({
      page: "3",
      q: "#000-001",
      loc: "shelf",
      tag: ["tools", "red"],
      negateTags: "true",
      archived: "true",
      orderBy: "createdAt",
      fields: "Color=red=blue",
    });
    expect(inventoryApiQuery(state, 24)).toEqual({
      page: 3,
      pageSize: 24,
      q: "#000-001",
      parentIds: ["shelf"],
      tags: ["tools", "red"],
      negateTags: true,
      includeArchived: true,
      orderBy: "createdAt",
      onlyWithPhoto: false,
      onlyWithoutPhoto: false,
      fields: ["Color=red=blue"],
    });
  });
  it("omits defaults while preserving non-inventory URL state and serializes option booleans", () => {
    expect(cleanInventoryQuery({ ...queryDefaults, q: "drill", archived: true, extra: "keep" })).toEqual({
      q: "drill",
      archived: "true",
      extra: "keep",
    });
  });
});
