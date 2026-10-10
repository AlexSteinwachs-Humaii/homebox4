// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import OffboardingHistory from "./OffboardingHistory.vue";
import en from "@/locales/en.json";
import type { EntityOffboardingRecord } from "@/lib/api/types/data-contracts";

vi.mock("@/components/Base/Card.vue", () => ({
  default: { template: "<section><slot name='title' /><slot /></section>" },
}));
vi.mock("@/components/global/DateTime.vue", () => ({
  default: { props: ["date"], template: "<time>{{ date }}</time>" },
}));

test("shows current status independently of retained cycles in deterministic chronological order", async () => {
  const records: EntityOffboardingRecord[] = [
    {
      id: "c",
      createdAt: "2026-10-10T12:00:00Z",
      effectiveDate: "2025-01-01",
      outcome: "custom",
      customReason: "Returned",
      notes: "Second cycle",
    },
    {
      id: "b",
      createdAt: "2026-10-09T12:00:00Z",
      effectiveDate: "2026-10-09",
      outcome: "sold",
      customReason: "",
      notes: "First cycle",
      reactivatedAt: "2026-10-10T10:00:00Z",
    },
  ];
  const wrapper = mount(OffboardingHistory, {
    props: { records, offboarded: true },
    global: {
      plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })],
      stubs: {
        BaseCard: { template: "<section><slot name='title' /><slot /></section>" },
        DateTime: { props: ["date"], template: "<time>{{ date }}</time>" },
      },
    },
  });
  expect(wrapper.get("[role=status]").text()).toBe("Offboarded");
  expect(wrapper.findAll("li").map(li => li.text())).toEqual([
    expect.stringContaining("First cycle"),
    expect.stringContaining("Second cycle"),
  ]);
  expect(wrapper.findAll("li")[1]!.text()).toContain("2025-01-01");
  expect(wrapper.findAll("li")[1]!.text()).toContain("Returned");
  expect(wrapper.get("time").text()).toBe("2026-10-10T10:00:00Z");
  expect(records[0]!.id).toBe("c"); // Sorting does not mutate the API/cache response.
  await wrapper.setProps({ offboarded: false });
  expect(wrapper.get("[role=status]").text()).toBe("Active");
  expect(wrapper.findAll("li")).toHaveLength(2);
  await wrapper.setProps({ records: [...records, { ...records[0]!, id: "d", notes: "Third cycle" }] });
  expect(wrapper.findAll("li")[2]!.text()).toContain("Third cycle");
  wrapper.unmount();
});
