import type { EntityOut } from "./api/types/data-contracts";
import type { Details } from "../components/global/DetailsSection/types";
import { maybeUrl, validDate } from "../composables/utils";

/** Preserve explicit zero quantities and false flags; only optional blanks are hidden. */
export function itemSpecificationDetails(item: EntityOut, showEmpty: boolean): Details {
  const details: Details = [
    { name: "items.quantity", text: item.quantity, slot: "quantity" },
    { name: "items.manufacturer", text: item.manufacturer ?? "", copyable: true },
    { name: "items.model_number", text: item.modelNumber ?? "", copyable: true },
    { name: "items.serial_number", text: item.serialNumber ?? "", copyable: true },
    { name: "items.insured", text: item.insured, slot: "insured" },
    { name: "items.archived", text: item.archived, slot: "archived" },
    { name: "items.notes", text: item.notes ?? "", type: "markdown" },
  ];
  if (item.assetId && item.assetId !== "000-000") {
    details.push({
      name: "items.asset_id",
      text: item.assetId,
      copyable: true,
    });
  }
  details.push(
    ...item.fields.map(field => {
      const url = maybeUrl(field.textValue ?? "");
      return url.isUrl
        ? {
            name: field.name,
            text: url.text,
            type: "link" as const,
            href: url.url,
          }
        : { name: field.name, text: field.textValue ?? "" };
    })
  );
  return showEmpty ? details : details.filter(detail => detail.text !== "" && detail.text != null);
}

export function itemPurchaseDetails(item: EntityOut, showEmpty: boolean): Details {
  const details: Details = [];
  if (showEmpty || item.purchaseFrom) details.push({ name: "items.purchased_from", text: item.purchaseFrom ?? "" });
  // A recorded zero is meaningful; the API does not distinguish unset price from zero.
  if (typeof item.purchasePrice === "number" && Number.isFinite(item.purchasePrice)) {
    details.push({ name: "items.purchase_price", text: String(item.purchasePrice), type: "currency" });
  } else if (showEmpty) {
    details.push({ name: "items.purchase_price", text: "" });
  }
  if (showEmpty || validDate(item.purchaseDate)) {
    details.push({
      name: "items.purchase_date",
      text: item.purchaseDate ?? "",
      type: "date",
      date: true,
    });
  }
  return details;
}
