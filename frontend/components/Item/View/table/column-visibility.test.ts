import { describe, expect, it } from "vitest";
import { createTable, getCoreRowModel } from "@tanstack/vue-table";
import { requireVisibleColumns } from "./column-visibility";

describe("Recently Added column visibility", () => {
  it.each([
    ["defaults", { assetId: false, name: true, quantity: true }],
    ["saved headers missing Asset ID", { name: true, quantity: false }],
    ["saved headers hiding Asset ID", { assetId: false, name: true, quantity: false }],
  ])("shows the formatted Asset ID with %s without mutating preferences", (_label, saved) => {
    const before = { ...saved };
    const visibility = requireVisibleColumns(saved, ["assetId"]);
    const table = createTable({
      data: [{ assetId: "000-001", name: "Camera", quantity: 1 }],
      columns: [
        { id: "assetId", accessorKey: "assetId" },
        { id: "name", accessorKey: "name" },
        { id: "quantity", accessorKey: "quantity" },
      ],
      state: {
        columnVisibility: visibility,
        columnOrder: Object.keys(saved),
        columnPinning: {},
      },
      getCoreRowModel: getCoreRowModel(),
      onStateChange: () => {},
      renderFallbackValue: null,
    });
    expect(
      table
        .getRowModel()
        .rows[0]?.getVisibleCells()
        .find(cell => cell.column.id === "assetId")
        ?.getValue()
    ).toBe("000-001");
    expect(saved).toEqual(before);
    expect(visibility.name).toBe(saved.name);
    expect(visibility.quantity).toBe(saved.quantity);
  });

  it("leaves other table consumers' visibility unchanged", () => {
    const saved = { assetId: false, name: true };
    expect(requireVisibleColumns(saved)).toEqual(saved);
  });
});
