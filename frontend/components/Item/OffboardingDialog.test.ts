// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { useTextareaAutosize } from "@vueuse/core";
import OffboardingDialog from "./OffboardingDialog.vue";
import en from "@/locales/en.json";

vi.stubGlobal("useTextareaAutosize", useTextareaAutosize);

const { offboard, reactivate } = vi.hoisted(() => ({ offboard: vi.fn(), reactivate: vi.fn() }));
vi.mock("@/composables/use-api", () => ({ useUserApi: () => ({ items: { offboard, reactivate } }) }));

function render(offboarded = false) {
  return mount(OffboardingDialog, {
    props: { open: true, itemId: "asset-id", offboarded },
    global: {
      plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })],
      // The real form controls are rendered; only portal/focus management is stubbed.
      stubs: Object.fromEntries(
        ["DialogRoot", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"].map(
          name => [name, { name, template: "<div><slot /></div>" }]
        )
      ),
    },
  });
}

afterEach(() => vi.resetAllMocks());

describe("asset lifecycle dialog", () => {
  test("initially open form has six outcomes and a local date, with conditional reason", async () => {
    const wrapper = render();
    expect(wrapper.findAll("option").map(option => option.attributes("value"))).toEqual([
      "sold",
      "donated",
      "disposed",
      "recycled",
      "lost",
      "custom",
    ]);
    expect((wrapper.get("input[type=date]").element as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(wrapper.find("#offboarding-reason").exists()).toBe(false);
    await wrapper.get("select").setValue("custom");
    await wrapper.get("#offboarding-reason").setValue("   ");
    await wrapper.get("textarea").setValue("Keep these notes");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("[role=alert]").text()).toBe("Enter a custom reason.");
    expect(offboard).not.toHaveBeenCalled();
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Keep these notes");
    wrapper.unmount();
  });

  test.each(["response", "exception"])(
    "preserves all input after a request %s failure and allows retry",
    async failure => {
      const wrapper = render();
      await wrapper.get("select").setValue("custom");
      await wrapper.get("#offboarding-reason").setValue("  Returned to supplier  ");
      await wrapper.get("input[type=date]").setValue("2026-10-09");
      await wrapper.get("textarea").setValue("Retained notes");
      if (failure === "response") offboard.mockResolvedValueOnce({ error: { status: 409 } });
      else offboard.mockRejectedValueOnce(new Error("Network failed"));
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(wrapper.get("[role=alert]").text()).toContain("Unable to save");
      expect(wrapper.emitted("saved")).toBeUndefined();
      expect(wrapper.emitted("update:open")).toBeUndefined();
      expect((wrapper.get("#offboarding-reason").element as HTMLInputElement).value).toBe("  Returned to supplier  ");
      expect((wrapper.get("input[type=date]").element as HTMLInputElement).value).toBe("2026-10-09");
      expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Retained notes");
      offboard.mockResolvedValueOnce({ data: {} });
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(offboard).toHaveBeenLastCalledWith("asset-id", {
        outcome: "custom",
        effectiveDate: "2026-10-09",
        customReason: "Returned to supplier",
        notes: "Retained notes",
      });
      expect(wrapper.emitted("saved")).toHaveLength(1);
      expect(wrapper.emitted("update:open")).toEqual([[false]]);
      wrapper.unmount();
    }
  );

  test.each([false, true])(
    "prevents repeated submissions and closing while pending (offboarded=%s)",
    async offboarded => {
      let resolve!: (value: unknown) => void;
      const request = new Promise(r => {
        resolve = r;
      });
      const method = offboarded ? reactivate : offboard;
      method.mockReturnValue(request);
      const wrapper = render(offboarded);
      await wrapper.get("form").trigger("submit");
      await wrapper.get("form").trigger("submit");
      expect(method).toHaveBeenCalledTimes(1);
      expect(wrapper.get("form").attributes("aria-busy")).toBe("true");
      expect(wrapper.findAll("button").every(button => button.attributes("disabled") !== undefined)).toBe(true);
      wrapper.findComponent({ name: "DialogRoot" }).vm.$emit("update:open", false);
      expect(wrapper.emitted("update:open")).toBeUndefined();
      expect(wrapper.emitted("saved")).toBeUndefined();
      resolve({ data: {} });
      await flushPromises();
      expect(wrapper.emitted("saved")).toHaveLength(1);
      expect(wrapper.emitted("update:open")).toEqual([[false]]);
      wrapper.unmount();
    }
  );

  test("reactivation failure retains the confirmation without reporting success", async () => {
    reactivate.mockResolvedValue({ error: { status: 500 } });
    const wrapper = render(true);
    expect(wrapper.find("select").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("Unable to save");
    expect(wrapper.emitted("saved")).toBeUndefined();
    expect(wrapper.emitted("update:open")).toBeUndefined();
    wrapper.unmount();
  });
});
