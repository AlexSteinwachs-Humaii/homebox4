import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import type { EntityFieldData, EntityUpdate, EntityOut } from "../../types/data-contracts";
import { AttachmentTypes } from "../../types/non-generated";
import type { UserClient } from "../../user";
import { factories } from "../factories";
import { sharedUserClient } from "../test-utils";

describe("user should be able to create an item and add an attachment", () => {
  let increment = 0;
  /**
   * useLocation sets up a location resource for testing, and returns a function
   * that can be used to delete the location from the backend server.
   */
  async function useLocation(api: UserClient): Promise<[EntityOut, () => Promise<void>]> {
    // Locations must carry the group's location entity type; without an
    // entityTypeId the backend defaults new entities to the item type.
    const { response: typesResponse, data: entityTypes } = await api.entityTypes.getAll();
    expect(typesResponse.status).toBe(200);
    const locationType = entityTypes.find(t => t.isLocation);
    expect(locationType).toBeTruthy();

    const { response, data } = await api.items.createLocation({
      parentId: null,
      name: `__test__.location.name_${increment}`,
      description: `__test__.location.description_${increment}`,
      entityTypeId: locationType!.id,
    });
    expect(response.status).toBe(201);
    increment++;

    const cleanup = async () => {
      const { response } = await api.items.deleteLocation(data.id);
      expect(response.status).toBe(204);
    };

    return [data, cleanup];
  }

  test("user should be able to create an item and add an attachment", async () => {
    const api = await sharedUserClient();
    const [location, cleanup] = await useLocation(api);

    const { response, data: item } = await api.items.create({
      parentId: null,
      name: "test-item",
      tagIds: [],
      description: "test-description",
      quantity: 2,
      parentId: location.id,
    });
    expect(response.status).toBe(201);

    // Add attachment
    {
      const testFile = new Blob(["test"], { type: "text/plain" });
      const { response } = await api.items.attachments.add(item.id, testFile, "test.txt", AttachmentTypes.Attachment);
      expect(response.status).toBe(201);
    }

    // Get Attachment
    const { response: itmResp, data } = await api.items.get(item.id);
    expect(itmResp.status).toBe(200);

    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0]?.title).toBe("test.txt");

    const resp = await api.items.attachments.delete(data.id, data.attachments[0]!.id);
    expect(resp.response.status).toBe(204);

    api.items.delete(item.id);
    await cleanup();
  });

  test("user should be able to create and delete fields on an item", async () => {
    const api = await sharedUserClient();
    const [location, cleanup] = await useLocation(api);

    const { response, data: item } = await api.items.create({
      parentId: null,
      name: faker.vehicle.model(),
      tagIds: [],
      description: faker.lorem.paragraph(1),
      quantity: 2,
      parentId: location.id,
    });
    expect(response.status).toBe(201);

    const fields: EntityFieldData[] = [
      factories.itemField(),
      factories.itemField(),
      factories.itemField(),
      factories.itemField(),
    ];

    // Add fields
    const itemUpdate = {
      ...item,
      parentId: item.parent?.id || null,
      tagIds: item.tags.map(l => l.id),
      fields,
    };

    const { response: updateResponse, data: item2 } = await api.items.update(item.id, itemUpdate as EntityUpdate);
    expect(updateResponse.status).toBe(200);

    expect(item2.fields).toHaveLength(fields.length);

    for (let i = 0; i < fields.length; i++) {
      expect(item2.fields[i]?.name).toBe(fields[i]!.name);
      expect(item2.fields[i]?.textValue).toBe(fields[i]!.textValue);
      expect(item2.fields[i]?.numberValue).toBe(fields[i]!.numberValue);
    }

    itemUpdate.fields = [fields[0]!, fields[1]!];

    const { response: updateResponse2, data: item3 } = await api.items.update(item.id, itemUpdate as EntityUpdate);
    expect(updateResponse2.status).toBe(200);

    expect(item3.fields).toHaveLength(2);
    for (let i = 0; i < item3.fields.length; i++) {
      expect(item3.fields[i]?.name).toBe(itemUpdate.fields[i]!.name);
      expect(item3.fields[i]?.textValue).toBe(itemUpdate.fields[i]!.textValue);
      expect(item3.fields[i]?.numberValue).toBe(itemUpdate.fields[i]!.numberValue);
    }

    cleanup();
  });

  test("users should be able to create and few maintenance logs for an item", async () => {
    const api = await sharedUserClient();
    const [location, cleanup] = await useLocation(api);
    const { response, data: item } = await api.items.create({
      parentId: null,
      name: faker.vehicle.model(),
      tagIds: [],
      description: faker.lorem.paragraph(1),
      quantity: 2,
      parentId: location.id,
    });
    expect(response.status).toBe(201);

    const maintenanceEntries = [];
    for (let i = 0; i < 5; i++) {
      const { response, data } = await api.items.maintenance.create(item.id, {
        name: faker.vehicle.model(),
        description: faker.lorem.paragraph(1),
        completedDate: faker.date.past().toISOString().slice(0, 10),
        scheduledDate: "",
        cost: faker.number.int(100).toString(),
      });

      expect(response.status).toBe(201);
      maintenanceEntries.push(data);
    }

    // Log
    {
      const { response, data } = await api.items.maintenance.getLog(item.id);
      expect(response.status).toBe(200);
      expect(data).toHaveLength(maintenanceEntries.length);
    }

    cleanup();
  });

  test("full path of item should be retrievable", async () => {
    const api = await sharedUserClient();
    const [location, cleanup] = await useLocation(api);

    const locations = [location.name, faker.animal.dog(), faker.animal.cat(), faker.animal.cow(), faker.animal.bear()];

    let lastLocationId = location.id;
    for (let i = 1; i < locations.length; i++) {
      // Skip first one
      const { response, data: loc } = await api.items.createLocation({
        parentId: lastLocationId,
        name: locations[i]!,
        description: "",
      });
      expect(response.status).toBe(201);

      lastLocationId = loc.id;
    }

    const { response, data: item } = await api.items.create({
      name: faker.vehicle.model(),
      tagIds: [],
      description: faker.lorem.paragraph(1),
      quantity: 2,
      parentId: lastLocationId,
    });
    expect(response.status).toBe(201);

    const { response: pathResponse, data: fullpath } = await api.items.fullpath(item.id);
    expect(pathResponse.status).toBe(200);

    const names = fullpath.map(p => p.name);

    expect(names).toHaveLength(locations.length + 1);
    expect(names).toEqual([...locations, item.name]);

    cleanup();
  });

  test("child items sync their location to their parent", async () => {
    const api = await sharedUserClient();
    const [parentLocation, parentCleanup] = await useLocation(api);
    const [childsLocation, childsCleanup] = await useLocation(api);

    const { response: parentResponse, data: parent } = await api.items.create({
      name: "parent-item",
      tagIds: [],
      description: "test-description",
      quantity: 2,
      parentId: parentLocation.id,
    });
    expect(parentResponse.status).toBe(201);
    expect(parent.id).toBeTruthy();

    const { response: child1Response, data: child1Item } = await api.items.create({
      name: "child1-item",
      tagIds: [],
      description: "test-description",
      quantity: 2,
      parentId: childsLocation.id,
    });
    expect(child1Response.status).toBe(201);
    const child1ItemUpdate = {
      ...child1Item,
      parentId: parent.id,
      tagIds: [],
    };
    const { response: child1UpdatedResponse } = await api.items.update(child1Item.id, child1ItemUpdate as EntityUpdate);
    expect(child1UpdatedResponse.status).toBe(200);

    const { response: child2Response, data: child2Item } = await api.items.create({
      name: "child2-item",
      tagIds: [],
      description: "test-description",
      quantity: 2,
      parentId: childsLocation.id,
    });
    expect(child2Response.status).toBe(201);
    const child2ItemUpdate = {
      ...child2Item,
      parentId: parent.id,
      tagIds: [],
    };
    const { response: child2UpdatedResponse } = await api.items.update(child2Item.id, child2ItemUpdate as EntityUpdate);
    expect(child2UpdatedResponse.status).toBe(200);

    const itemUpdate = {
      ...parent,
      parentId: parentLocation.id,
      tagIds: [],
      syncChildEntityLocations: true,
    };
    const { response: updateResponse } = await api.items.update(parent.id, itemUpdate);
    expect(updateResponse.status).toBe(200);

    // Children stay attached to the parent item (#1591) and derive their
    // location from the ancestor chain, so it follows the parent's location.
    const { response: child1FinalResponse, data: child1FinalData } = await api.items.get(child1Item.id);
    expect(child1FinalResponse.status).toBe(200);
    expect(child1FinalData.parent?.id).toBe(parent.id);
    expect(child1FinalData.location?.id).toBe(parentLocation.id);

    const { response: child2FinalResponse, data: child2FinalData } = await api.items.get(child2Item.id);
    expect(child2FinalResponse.status).toBe(200);
    expect(child2FinalData.parent?.id).toBe(parent.id);
    expect(child2FinalData.location?.id).toBe(parentLocation.id);

    parentCleanup();
    childsCleanup();
  });
});

describe("asset lifecycle API", () => {
  test("offboarding discovery, retained history, counts and archive independence", async () => {
    const api = await sharedUserClient();
    const name = `lifecycle-${faker.string.uuid()}`;
    const types = (await api.entityTypes.getAll()).data;
    const location = (
      await api.items.createLocation({
        name: `${name}-room`,
        description: "",
        parentId: null,
        quantity: 1,
        tagIds: [],
        entityTypeId: types.find(t => t.isLocation)!.id,
      })
    ).data;
    const item = (
      await api.items.create({
        name,
        description: "",
        parentId: location.id,
        quantity: 3,
        tagIds: [],
        entityTypeId: types.find(t => !t.isLocation)!.id,
      })
    ).data;
    const input = {
      outcome: "donated" as const,
      effectiveDate: "2026-10-09",
      customReason: "",
      notes: "retained notes",
    };
    try {
      const before = (await api.stats.group()).data;
      expect((await api.items.offboardingHistory(item.id)).data).toEqual([]);
      expect(
        (
          await api.items.offboard(item.id, {
            ...input,
            outcome: "custom",
            customReason: " ",
          })
        ).response.status
      ).toBe(400);
      expect(
        (
          await api.items.offboard(item.id, {
            ...input,
            effectiveDate: "2026-02-30",
          })
        ).response.status
      ).toBe(400);
      expect((await api.items.get(item.id)).data.offboarded).toBe(false);
      expect((await api.items.offboard(location.id, input)).response.status).toBe(400);
      expect((await api.items.reactivate(location.id)).response.status).toBe(400);
      const first = await api.items.offboard(item.id, input);
      expect(first.response.status).toBe(201);
      expect(first.data.effectiveDate).toBe(input.effectiveDate);
      expect((await api.items.offboard(item.id, input)).response.status).toBe(409);
      expect((await api.items.getAll({ q: name })).data.total).toBe(0);
      expect((await api.items.getAll({ q: name, orderBy: "createdAt", pageSize: 5 })).data.items).toEqual([]);
      expect((await api.items.getAll({ q: name, lifecycle: "all" })).data.total).toBe(1);
      expect(
        (
          await api.items.getAll({
            q: name,
            lifecycle: "offboarded",
            page: 1,
            pageSize: 1,
          })
        ).data.items[0]!.offboarded
      ).toBe(true);
      const after = (await api.stats.group()).data;
      expect(after.totalItems).toBe(before.totalItems - 1);
      expect(after.totalLocations).toBe(before.totalLocations);
      expect((await api.items.getLocations()).data.find(l => l.id === location.id)?.itemCount ?? 0).toBe(0);
      const detail = (await api.items.get(item.id)).data;
      expect(detail.offboardingHistory).toHaveLength(1);
      expect(detail.offboardingHistory[0]!.notes).toBe(input.notes);
      expect((await api.items.reactivate(item.id)).response.status).toBe(204);
      expect((await api.items.reactivate(item.id)).response.status).toBe(409);
      expect((await api.items.getAll({ q: name })).data.total).toBe(1);
      expect((await api.items.getLocations()).data.find(l => l.id === location.id)?.itemCount).toBe(3);
      const returned = (await api.items.get(item.id)).data;
      expect(
        (
          await api.items.update(item.id, {
            ...returned,
            archived: true,
            parentId: location.id,
            entityTypeId: returned.entityType!.id,
            tagIds: returned.tags.map(t => t.id),
          })
        ).response.status
      ).toBe(200);
      const second = await api.items.offboard(item.id, input);
      expect(second.response.status).toBe(201);
      expect(second.data.id).not.toBe(first.data.id);
      expect((await api.items.reactivate(item.id)).response.status).toBe(204);
      expect((await api.items.getAll({ q: name })).data.total).toBe(0);
      expect((await api.items.getAll({ q: name, includeArchived: true })).data.total).toBe(1);
      const history = (await api.items.offboardingHistory(item.id)).data;
      expect(history.map(r => r.id)).toEqual([first.data.id, second.data.id]);
      expect(history.every(r => r.reactivatedAt !== null)).toBe(true);
      expect((await api.items.get(item.id)).data.archived).toBe(true);

      const otherUser = factories.user();
      const publicApi = factories.client.public();
      expect((await publicApi.register(otherUser)).response.status).toBe(204);
      const login = await publicApi.login(otherUser.email, otherUser.password);
      const other = factories.client.user(login.data.token);
      expect((await other.items.offboardingHistory(item.id)).response.status).toBe(404);
      expect((await other.items.offboard(item.id, input)).response.status).toBe(404);
      expect((await other.items.reactivate(item.id)).response.status).toBe(404);
      expect((await api.items.offboardingHistory(item.id)).data).toEqual(history);
    } finally {
      await api.items.delete(item.id);
      await api.items.deleteLocation(location.id);
    }
  });
});
