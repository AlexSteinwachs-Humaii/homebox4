import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsAPI } from "./reports";
import { Requests } from "../../requests";
import { makeCSVPresentation } from "../../reporting-csv";

const presentation = makeCSVPresentation(
  ["quantity", "name"],
  key => key,
  n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n),
  date => `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
  "UTC"
);
afterEach(() => vi.unstubAllGlobals());

describe("filtered CSV transport", () => {
  it("captures filters, sort and columns, omits pagination, and retains tenant/auth/interceptors", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("Quantity,Name\n", {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="filtered-report-2026-10-09.csv"',
          },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const http = new Requests("", "Bearer token", { "X-Tenant": "collection-a" });
    const intercept = vi.fn();
    http.addResponseInterceptor(intercept);
    const query = {
      q: "needle",
      tags: ["tag-a", "tag-b"],
      parentIds: ["location"],
      fields: ["color=red"],
      orderBy: "updatedAt",
      includeArchived: true,
      onlyWithoutPhoto: true,
      negateTags: true,
      page: 3,
      pageSize: 12,
    };
    const controller = new AbortController();
    const pending = new ReportsAPI(http).filteredCSV(query, presentation, controller.signal);
    query.q = "changed";
    query.tags.push("changed");
    const file = await pending;
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("q")).toBe("needle");
    expect(params.getAll("tags")).toEqual(["tag-a", "tag-b"]);
    expect(params.getAll("parentIds")).toEqual(["location"]);
    expect(params.getAll("fields")).toEqual(["color=red"]);
    expect(params.get("orderBy")).toBe("updatedAt");
    expect(params.get("negateTags")).toBe("true");
    expect(params.has("page")).toBe(false);
    expect(params.has("pageSize")).toBe(false);
    expect(JSON.parse(params.get("presentation")!)).toEqual(presentation);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token", "X-Tenant": "collection-a" });
    expect(init.signal).toBe(controller.signal);
    expect(intercept).toHaveBeenCalledOnce();
    expect(file.filename).toBe("filtered-report-2026-10-09.csv");
    expect(await file.blob.text()).toBe("Quantity,Name\n");
  });

  it.each([
    [500, "application/json"],
    [403, "application/json"],
    [401, "application/json"],
    [400, "text/csv"],
    [200, "application/json"],
    [200, "text/html"],
  ])("rejects status %s / %s rather than downloading it", async (status, contentType) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"failed"}', { status, headers: { "Content-Type": contentType } }))
    );
    await expect(new ReportsAPI(new Requests("")).filteredCSV({}, presentation)).rejects.toThrow("CSV export failed");
  });

  it("does not use an unsafe server filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Name\n", {
            headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="../../bad.csv"' },
          })
      )
    );
    const file = await new ReportsAPI(new Requests("")).filteredCSV({}, presentation);
    expect(file.filename).toBe("filtered-report.csv");
  });
});
