import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ref, watch, nextTick } from "vue";
import { normalizeThemePreferences, PREFERENCE_STORAGE_KEY } from "../lib/data/theme-preferences";
import { themes } from "../lib/data/themes";

const initialScript = readFileSync("public/set-theme.js", "utf8");
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = "";
});

describe("one-time browser theme rollout", () => {
  it.each([null, "broken", "null", "[]", "42", JSON.stringify({ theme: "dark", language: "fr", unknown: true })])(
    "normalizes %s before paint and agrees with hydration",
    raw => {
      if (raw !== null) localStorage.setItem(PREFERENCE_STORAGE_KEY, raw);
      window.eval(initialScript);
      const stored = JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY)!);
      expect(stored.theme).toBe("claude");
      expect(document.documentElement.dataset.theme).toBe("claude");
      expect(normalizeThemePreferences(stored)).toEqual(stored);
      if (raw?.includes("language")) expect(stored).toMatchObject({ language: "fr", unknown: true });
    }
  );
  it("retains every available later choice on repeat startup", () => {
    for (const { value: theme } of themes) {
      const prefs = {
        theme,
        themeMigrationVersion: 1,
        language: "de",
        unknown: { keep: true },
      };
      localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(prefs));
      window.eval(initialScript);
      expect(JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY)!)).toEqual(prefs);
      expect(normalizeThemePreferences(prefs)).toEqual(prefs);
      expect(document.documentElement.dataset.theme).toBe(theme);
    }
  });
  it("falls back for invalid marked themes", () => {
    expect(normalizeThemePreferences({ theme: "invalid", themeMigrationVersion: 1 }).theme).toBe("claude");
  });
  it("still paints Claude when browser storage is disabled", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("disabled");
    });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("disabled");
    });
    try {
      window.eval(initialScript);
      expect(document.documentElement.dataset.theme).toBe("claude");
    } finally {
      spy.mockRestore();
      write.mockRestore();
    }
  });
});

it.each([false, true])(
  "does not upload stale startup preferences and retains hydration edits (theme edit: %s)",
  async editTheme => {
    let resolve!: (value: unknown) => void;
    const getSettings = vi.fn(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    const setSettings = vi.fn(async () => ({ error: false }));
    const auth = ref({ token: "token", isAuthorized: () => true });
    const stops: (() => void)[] = [];
    for (const [name, value] of Object.entries({
      useLocalStorage: (_key: string, defaults: object, options: { serializer: { read: (raw: string) => unknown } }) =>
        ref({
          ...defaults,
          ...(options.serializer.read(JSON.stringify({ theme: "dark", language: "fr" })) as object),
        }),
      watch: (...args: Parameters<typeof watch>) => {
        const stop = watch(...args);
        stops.push(stop);
        return stop;
      },
      useAuthContext: () => auth.value,
      useUserApi: () => ({ user: { getSettings, setSettings } }),
      useDebounceFn: (fn: () => void) => fn,
      onServerEvent: () => {},
      ServerEvent: { UserMutation: "user" },
    }))
      vi.stubGlobal(name, value);
    const { useViewPreferences, useViewPreferencesSync } = await import("../composables/use-preferences");
    try {
      useViewPreferencesSync();
      const prefs = useViewPreferences();
      expect(prefs.value.theme).toBe("claude");
      prefs.value.itemsPerTablePage = 48;
      if (editTheme) prefs.value.theme = "garden";
      resolve({
        data: {
          item: {
            theme: "light",
            themeMigrationVersion: 1,
            language: "de",
            itemsPerTablePage: 12,
          },
        },
        error: false,
      });
      await nextTick();
      await nextTick();
      await nextTick();
      expect(prefs.value.theme).toBe(editTheme ? "garden" : "light");
      expect(prefs.value.language).toBe("de");
      expect(prefs.value.itemsPerTablePage).toBe(48);
      expect(setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: editTheme ? "garden" : "light",
          themeMigrationVersion: 1,
          itemsPerTablePage: 48,
        })
      );
      prefs.value.theme = "dark";
      await nextTick();
      await nextTick();
      expect(setSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: "dark", themeMigrationVersion: 1 })
      );
    } finally {
      stops.forEach(stop => stop());
    }
  }
);
