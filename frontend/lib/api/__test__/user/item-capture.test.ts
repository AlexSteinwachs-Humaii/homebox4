import { describe, expect, test } from "vitest";
import { factories } from "../factories";
import { captureUpdate } from "../../../../composables/use-item-capture";
import { emptyItemForm } from "../../../items/item-form";

describe("capture references remain collection scoped", () => {
  test("foreign type, parent and tag cannot be attached by create or supplemental update", async () => {
    const { client: own } = await factories.client.singleUse();
    const { client: foreign } = await factories.client.singleUse();
    const ownTypes = (await own.entityTypes.getAll()).data;
    const foreignTypes = (await foreign.entityTypes.getAll()).data;
    const ownType = ownTypes.find(type => !type.isLocation)!;
    const foreignType = foreignTypes.find(type => !type.isLocation)!;
    const locationType = ownTypes.find(type => type.isLocation)!;
    const foreignLocationType = foreignTypes.find(type => type.isLocation)!;
    const { data: location } = await own.items.create({
      name: "Own capture office",
      description: "",
      quantity: 1,
      entityTypeId: locationType.id,
      tagIds: [],
    });
    const { data: foreignLocation } = await foreign.items.create({
      name: "Foreign capture office",
      description: "",
      quantity: 1,
      entityTypeId: foreignLocationType.id,
      tagIds: [],
    });
    const { data: foreignTag } = await foreign.tags.create({
      name: "Foreign capture tag",
      description: "",
      color: "#123456",
      icon: "",
    });
    const input = { ...emptyItemForm(), name: "Scoped capture", entityTypeId: ownType.id, location };
    const core = {
      name: input.name,
      description: "",
      quantity: 1,
      entityTypeId: ownType.id,
      parentId: location.id,
      tagIds: [] as string[],
    };
    const before = (await own.items.getAll({ q: input.name })).data.items.length;
    const attempts = [{ entityTypeId: foreignType.id }, { parentId: foreignLocation.id }, { tagIds: [foreignTag.id] }];
    for (const reference of attempts) {
      const result = await own.items.create({ ...core, ...reference });
      expect(result.status, JSON.stringify(reference)).toBeGreaterThanOrEqual(400);
    }
    expect((await own.items.getAll({ q: input.name })).data.items.length).toBe(before);
    const created = await own.items.create(core);
    expect(created.status).toBe(201);
    for (const reference of attempts) {
      const result = await own.items.update(created.data.id, { ...captureUpdate(created.data, input), ...reference });
      expect(result.status, JSON.stringify(reference)).toBeGreaterThanOrEqual(400);
    }
    const stored = await own.items.get(created.data.id);
    expect(stored.data.entityType?.id).toBe(ownType.id);
    expect(stored.data.parent?.id).toBe(location.id);
    expect(stored.data.tags).toEqual([]);
    expect((await foreign.items.get(created.data.id)).status).toBeGreaterThanOrEqual(400);
    await own.items.delete(created.data.id);
    await own.items.delete(location.id);
    await foreign.items.delete(foreignLocation.id);
    await foreign.tags.delete(foreignTag.id);
  });
});
