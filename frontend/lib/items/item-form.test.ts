import { describe, expect, it } from "vitest";
import { emptyItemForm, validateItemForm } from "./item-form";
import type { EntitySummary, EntityTypeSummary, TagOut } from "../api/types/data-contracts";

const location = { id: "collection-location", name: "Office" } as EntitySummary;
const options = {
  types: [
    { id: "item-type", isLocation: false },
    { id: "location-type", isLocation: true },
  ] as EntityTypeSummary[],
  locations: [location],
  tags: [{ id: "collection-tag" }] as TagOut[],
};
const validForm = () => ({
  ...emptyItemForm(),
  entityTypeId: "item-type",
  location,
  name: "My possession",
});

describe("shared item form", () => {
  it("starts without example values, purchase defaults or references", () => {
    expect(emptyItemForm()).toEqual({
      entityTypeId: "",
      location: null,
      name: "",
      quantity: 1,
      description: "",
      tagIds: [],
      purchasePrice: "",
      purchaseDate: "",
      purchaseFrom: "",
      insured: false,
    });
    const first = emptyItemForm();
    first.tagIds.push("one");
    expect(emptyItemForm().tagIds).toEqual([]);
  });

  it("requires name, an item type, and a real collection location", () => {
    expect(validateItemForm(emptyItemForm(), options)).toEqual(["entityTypeId", "location", "name"]);
    expect(validateItemForm(validForm(), options)).toEqual([]);
    expect(validateItemForm({ ...validForm(), entityTypeId: "location-type" }, options)).toContain("entityTypeId");
    expect(validateItemForm({ ...validForm(), location: { ...location, id: "other-collection" } }, options)).toContain(
      "location"
    );
    expect(validateItemForm({ ...validForm(), tagIds: ["other-collection"] }, options)).toContain("tagIds");
  });

  it("retains non-negative fractional quantities and zero purchase price", () => {
    expect(validateItemForm({ ...validForm(), quantity: "0.5", purchasePrice: 0 }, options)).toEqual([]);
    for (const quantity of ["", -1, NaN, Infinity, "invalid"]) {
      expect(validateItemForm({ ...validForm(), quantity }, options)).toContain("quantity");
    }
  });

  it("enforces text limits used by shared controls and vendor contract", () => {
    expect(
      validateItemForm(
        {
          ...validForm(),
          name: "a".repeat(255),
          description: "a".repeat(1000),
          purchaseFrom: "a".repeat(255),
        },
        options
      )
    ).toEqual([]);
    expect(
      validateItemForm(
        {
          ...validForm(),
          name: "a".repeat(256),
          description: "a".repeat(1001),
          purchaseFrom: "a".repeat(256),
        },
        options
      )
    ).toEqual(["name", "description", "purchaseFrom"]);
    expect(validateItemForm({ ...validForm(), name: "é".repeat(128) }, options)).toContain("name");
  });

  it("keeps purchase dates as date-only strings and rejects impossible days", () => {
    const form = { ...validForm(), purchaseDate: "2024-02-29" };
    expect(validateItemForm(form, options)).toEqual([]);
    expect(JSON.parse(JSON.stringify(form)).purchaseDate).toBe("2024-02-29");
    for (const purchaseDate of ["2025-02-29", "2026-02-30", "2026-10-09T00:00:00Z"]) {
      expect(validateItemForm({ ...form, purchaseDate }, options)).toContain("purchaseDate");
    }
  });
});
