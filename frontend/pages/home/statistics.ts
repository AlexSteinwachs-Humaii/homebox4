import type { UserClient } from "~~/lib/api/user";

/** Use the server's record-count and price × quantity semantics, never substitute zeros on failure. */
export async function loadStatistics(api: UserClient) {
  const [statistics, group] = await Promise.all([api.stats.group(), api.group.get()]);
  if (
    statistics.error ||
    !statistics.data ||
    ![
      statistics.data.totalItems,
      statistics.data.totalItemPrice,
      statistics.data.totalLocations,
      statistics.data.totalTags,
    ].every(Number.isFinite) ||
    group.error ||
    !group.data ||
    !/^[a-z]{3}$/i.test(group.data.currency)
  ) {
    throw new Error("Unable to load collection statistics");
  }
  return { ...statistics.data, currency: group.data.currency };
}
