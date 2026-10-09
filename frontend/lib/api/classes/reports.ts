import { BaseAPI, route } from "../base";
import type { ItemsQuery } from "./items";
import type { makeCSVPresentation } from "../../reporting-csv";

export type CSVDownload = { blob: Blob; filename: string };

export class ReportsAPI extends BaseAPI {
  async filteredCSV(
    query: ItemsQuery,
    presentation: ReturnType<typeof makeCSVPresentation>,
    signal?: AbortSignal
  ): Promise<CSVDownload> {
    // Build the URL synchronously: later filter changes cannot alter this request.
    const { page: _page, pageSize: _pageSize, ...filters } = query;
    const result = await this.http.get<unknown>({
      url: route("/reporting/filtered", {
        ...filters,
        presentation: JSON.stringify(presentation),
      }),
      signal,
    });
    if (result.error || !/^text\/csv(?:;|$)/i.test(result.response.headers.get("Content-Type") ?? "")) {
      throw new Error("CSV export failed");
    }
    const disposition = result.response.headers.get("Content-Disposition") ?? "";
    const filename =
      disposition.match(/filename="?(filtered-report-\d{4}-\d{2}-\d{2}\.csv)"?(?:;|$)/)?.[1] ?? "filtered-report.csv";
    return { blob: await result.response.blob(), filename };
  }

  billOfMaterialsURL(tenant?: string): string {
    if (tenant) {
      return route("/reporting/bill-of-materials", { tenant });
    }

    return route("/reporting/bill-of-materials");
  }
}
