import { describe, expect, it } from "vitest";
import { makeCSVPresentation, reportingColumnLabels, defaultReportingColumns } from "./reporting-csv";

const t = (key: string) => key;
const shortDate = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;

describe("reporting CSV presentation contract", () => {
  it("captures visible data-column order, translations and excludes controls", () => {
    const ids = ["select", "quantity", "name", "actions"];
    const p = makeCSVPresentation(
      ids,
      t,
      n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n),
      shortDate,
      "UTC"
    );
    ids.reverse();
    expect(p.columns).toEqual([
      { id: "quantity", label: "items.quantity" },
      { id: "name", label: "items.name" },
    ]);
    expect(p).toMatchObject({
      currencyPrefix: "$",
      currencySuffix: "",
      currencyDecimals: 2,
      decimalSeparator: ".",
      groupSeparator: ",",
      dateLayout: "01/02/2006",
      timeZone: "UTC",
    });
    expect(defaultReportingColumns).toEqual(["name", "quantity", "insured", "purchasePrice"]);
    expect(Object.keys(reportingColumnLabels)).toEqual([
      "assetId",
      "name",
      "quantity",
      "insured",
      "purchasePrice",
      "location",
      "archived",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("reuses non-ASCII currency literals, precision and locale short-date ordering", () => {
    const p = makeCSVPresentation(
      ["purchasePrice", "createdAt"],
      t,
      n => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n),
      d => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`,
      "Europe/Berlin"
    );
    expect(p).toMatchObject({
      currencyPrefix: "",
      currencySuffix: " €",
      currencyDecimals: 2,
      decimalSeparator: ",",
      groupSeparator: ".",
      dateLayout: "02.01.2006",
    });
    const jpy = makeCSVPresentation(
      ["purchasePrice"],
      t,
      n => new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY" }).format(n),
      shortDate,
      "UTC"
    );
    expect(jpy.currencyDecimals).toBe(0);
  });

  it("rejects empty or duplicated selections", () => {
    for (const ids of [["actions"], ["name", "name"]]) {
      expect(() => makeCSVPresentation(ids, t, String, shortDate, "UTC")).toThrow("Invalid report columns");
    }
  });
});

it("captures non-Western grouping and localized currency digits", () => {
  const indian = makeCSVPresentation(
    ["purchasePrice"],
    t,
    n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n),
    shortDate,
    "UTC"
  );
  expect(indian).toMatchObject({ groupSize: 3, secondaryGroupSize: 2 });
  const arabic = makeCSVPresentation(
    ["purchasePrice"],
    t,
    n => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(n),
    shortDate,
    "UTC"
  );
  expect(arabic).toMatchObject({ digits: "٠١٢٣٤٥٦٧٨٩", decimalSeparator: "٫", groupSeparator: "٬" });
});
