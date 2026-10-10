import type { UserClient } from "~~/lib/api/user";

export async function loadRecentItems(api: UserClient) {
  // The entities endpoint defaults to non-location records; createdAt is descending on the server.
  const result = await api.items.getAll({
    page: 1,
    pageSize: 5,
    orderBy: "createdAt",
    includeArchived: false,
  });
  if (result.error || !result.data) throw new Error("Unable to load recent possessions");
  return Promise.all(
    result.data.items.map(async item => {
      const path = await api.items.fullpath(item.id);
      if (path.error || !path.data) throw new Error("Unable to load possession location trail");
      return {
        ...item,
        locationTrail: path.data
          .filter(part => part.id !== item.id)
          .map(part => part.name)
          .join(" / "),
      };
    })
  );
}
