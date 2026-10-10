import { describe, expect, it } from "vitest";
import { inventorySearchTarget, isShellRouteActive } from "./shell-navigation";

describe("authenticated shell navigation", () => {
  it.each([
    ["/home", "/home"],
    ["/home/stats", "/home"],
    ["/items", "/items"],
    ["/item/123", "/items"],
    ["/item/123/edit", "/items"],
    ["/locations", "/locations"],
    ["/location/123", "/locations"],
    ["/maintenance", "/maintenance"],
    ["/maintenance/schedule", "/maintenance"],
    ["/tag/123", "/tags"],
    ["/template/123", "/templates"],
    ["/collection/tools", "/collection"],
  ])("activates %s under %s", (path, destination) => {
    expect(isShellRouteActive(path, destination)).toBe(true);
  });

  it.each(["/location/123", "/items-other", "/itemized", "/collection/items", "/templates"])(
    "does not activate Inventory for %s",
    path => {
      expect(isShellRouteActive(path, "/items")).toBe(false);
    }
  );

  it("hands the query to Inventory without losing special characters", () => {
    expect(inventorySearchTarget("  drill & bits #1  ")).toEqual({
      path: "/items",
      query: { q: "drill & bits #1" },
    });
    expect(inventorySearchTarget(" ")).toEqual({ path: "/items", query: {} });
  });
});
