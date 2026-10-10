import { describe, expect, it } from "vitest";
import type { EntityOut } from "./api/types/data-contracts";
import { itemPurchaseDetails, itemSpecificationDetails } from "./item-details";

const item = {
  quantity: 0,
  manufacturer: "Different maker",
  modelNumber: "MODEL-X",
  serialNumber: "SERIAL-Y",
  insured: false,
  archived: true,
  assetId: "009-123",
  notes: "Actual notes",
  fields: [{ name: "Capacity", textValue: "3 litres" }],
  purchaseFrom: "Local shop",
  purchasePrice: 0,
  purchaseDate: "2026-02-03",
} as EntityOut;

describe("reusable item details", () => {
  it("uses recorded identity, custom fields, zero quantity and false flags", () => {
    const details = itemSpecificationDetails(item, false);
    expect(details.find(d => d.name === "items.quantity")?.text).toBe(0);
    expect(details.find(d => d.name === "items.insured")?.text).toBe(false);
    expect(details.find(d => d.name === "items.archived")?.text).toBe(true);
    expect(details.find(d => d.name === "items.asset_id")?.text).toBe("009-123");
    expect(details.find(d => d.name === "items.manufacturer")?.text).toBe("Different maker");
    expect(details.find(d => d.name === "Capacity")?.text).toBe("3 litres");
  });

  it("hides only optional blanks and the existing unset asset sentinel", () => {
    const blank = { ...item, assetId: "000-000", manufacturer: "", modelNumber: "", notes: "" };
    expect(itemSpecificationDetails(blank, false).some(d => d.name === "items.manufacturer")).toBe(false);
    expect(itemSpecificationDetails(blank, true).find(d => d.name === "items.manufacturer")?.text).toBe("");
    expect(itemSpecificationDetails(blank, true).some(d => d.name === "items.asset_id")).toBe(false);
  });

  it("keeps price/date formatter types without substituting example values", () => {
    expect(itemPurchaseDetails(item, false)).toEqual([
      { name: "items.purchased_from", text: "Local shop" },
      { name: "items.purchase_price", text: "0", type: "currency" },
      { name: "items.purchase_date", text: "2026-02-03", type: "date", date: true },
    ]);
    const blank = { ...item, purchaseFrom: "", purchaseDate: "0001-01-01T00:00:00Z" };
    expect(itemPurchaseDetails(blank, false)).toEqual([{ name: "items.purchase_price", text: "0", type: "currency" }]);
    expect(itemPurchaseDetails(blank, true).length).toBe(3);
  });
});
