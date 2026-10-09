// Explicit contract with reporting.CSVPresentation. Controls never enter the export.
export const reportingColumnLabels = {
  assetId: "items.asset_id",
  name: "items.name",
  quantity: "items.quantity",
  insured: "items.insured",
  purchasePrice: "items.purchase_price",
  location: "items.location",
  archived: "items.archived",
  createdAt: "items.created_at",
  updatedAt: "items.updated_at",
} as const;

export const defaultReportingColumns = ["name", "quantity", "insured", "purchasePrice"];

/** Capture visible column IDs in table order and reuse the actual display formatters.
 * Pass this object as the JSON `presentation` query parameter on reporting/filtered.
 * Relative age and checkmark icons are UI decoration: dates use the same short date
 * included by DateTime, booleans are plain true/false. No row data is sent by the client.
 */
export function makeCSVPresentation(
  columnIds: string[],
  t: (key: string) => string,
  currency: (value: number) => string,
  shortDate: (value: Date) => string,
  timeZone: string
) {
  const columns = columnIds
    .filter((id): id is keyof typeof reportingColumnLabels => Object.hasOwn(reportingColumnLabels, id))
    .map(id => ({ id, label: t(reportingColumnLabels[id]) }));
  if (columns.length === 0 || new Set(columns.map(c => c.id)).size !== columns.length) {
    throw new Error("Invalid report columns");
  }

  // The dashboard uses Intl currency formatting. Extract its literal presentation
  // using positive samples, preserving NBSP and non-ASCII currency symbols.
  const digitSample = currency(9876543210)
    .match(/\p{Nd}/gu)
    ?.slice(0, 10);
  if (!digitSample || new Set(digitSample).size !== 10) throw new Error("Unsupported currency number format");
  const digits = [...digitSample].reverse().join("");
  const toLatin = (text: string) => text.replace(/\p{Nd}/gu, digit => String([...digits].indexOf(digit)));
  const sample = currency(1234567.89);
  const digitMatches = [...sample.matchAll(/\p{Nd}/gu)];
  const first = digitMatches[0]?.index;
  const finalDigit = digitMatches.at(-1);
  if (first === undefined || !finalDigit) throw new Error("Unsupported currency number format");
  const end = finalDigit.index + finalDigit[0].length;
  const number = toLatin(sample.slice(first, end));
  const small = toLatin(currency(1.1)).match(/1([^\d]+)(\d+)\D*$/);
  const decimalSeparator = small?.[1] ?? ".";
  const currencyDecimals = small?.[2]?.length ?? 0;
  const integer = currencyDecimals ? number.split(decimalSeparator)[0]! : number;
  const groupSeparator = integer.match(/[^\d]+/)?.[0] ?? "";
  const groups = groupSeparator ? integer.split(groupSeparator) : [];
  const groupSize = groups.at(-1)?.length ?? 3;
  const secondaryGroupSize = groups.length > 2 ? groups.at(-2)!.length : groupSize;

  // Infer the locale's numeric short date without maintaining a second locale map.
  const date = shortDate(new Date(2006, 10, 22));
  if (!date.includes("11") || !date.includes("22") || !date.includes("06")) {
    throw new Error("Unsupported short date format");
  }
  const padded = shortDate(new Date(2006, 0, 2));
  const dateLayout = date
    .replace(/2006|06/, "YEAR")
    .replace("11", padded.includes("01") ? "MONTH_PAD" : "MONTH")
    .replace("22", padded.includes("02") ? "DAY_PAD" : "DAY")
    .replace("YEAR", date.includes("2006") ? "2006" : "06")
    .replace("MONTH_PAD", "01")
    .replace("MONTH", "1")
    .replace("DAY_PAD", "02")
    .replace("DAY", "2");
  if (dateLayout === date) throw new Error("Unsupported short date format");

  return {
    columns,
    currencyPrefix: sample.slice(0, first),
    currencySuffix: sample.slice(end),
    digits,
    decimalSeparator,
    groupSeparator,
    groupSize,
    secondaryGroupSize,
    currencyDecimals,
    dateLayout,
    timeZone,
  };
}
