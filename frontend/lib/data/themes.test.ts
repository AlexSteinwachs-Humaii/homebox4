import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref, watch } from "vue";
import { themes, darkThemes } from "./themes";
import { applyThemeToElement } from "./apply-theme";
import { useTheme } from "../../composables/use-theme";

function element() {
  const classes = new Set(["locale-en", "theme-garden", "dark"]);
  const attributes = new Map<string, string>();
  return {
    classList: {
      [Symbol.iterator]: () => classes.values(),
      add: (...names: string[]) => names.forEach(name => classes.add(name)),
      remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
    },
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    classes,
    attributes,
  };
}

const bootstrap = readFileSync(new URL("../../public/set-theme.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../../assets/css/main.css", import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("selectable Warm Habitat", () => {
  it("keeps all existing theme options and classifies Warm Habitat as dark", () => {
    expect(themes.map(option => option.value)).toEqual([
      "warm-habitat",
      "homebox",
      "garden",
      "light",
      "cupcake",
      "bumblebee",
      "emerald",
      "corporate",
      "synthwave",
      "retro",
      "cyberpunk",
      "valentine",
      "halloween",
      "forest",
      "aqua",
      "lofi",
      "pastel",
      "fantasy",
      "wireframe",
      "black",
      "luxury",
      "dracula",
      "cmyk",
      "autumn",
      "business",
      "acid",
      "lemonade",
      "night",
      "coffee",
      "winter",
    ]);
    expect(darkThemes).toContain("warm-habitat");
  });

  it.each([...themes.map(option => option.value), "dark" as const])(
    "restores %s before mounting without changing saved preferences",
    theme => {
      const root = element();
      const saved = JSON.stringify({
        theme,
        language: "de",
        collectionId: "collection-1",
      });
      const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
      runInNewContext(bootstrap, {
        localStorage: storage,
        document: { documentElement: root },
        console,
      });
      expect(root.attributes.get("data-theme")).toBe(theme);
      expect([...root.classes]).toEqual(["locale-en", "theme-" + theme]);
      expect(storage.setItem).not.toHaveBeenCalled();
      const mounted = element();
      applyThemeToElement(mounted as unknown as HTMLElement, theme);
      expect([...mounted.classes]).toEqual([...root.classes]);
    }
  );

  it.each([null, "broken-json"])("leaves defaults alone for missing or corrupt storage (%s)", saved => {
    const root = element();
    runInNewContext(bootstrap, {
      localStorage: { getItem: () => saved },
      document: { documentElement: root },
      console: { log: vi.fn(), error: vi.fn() },
    });
    expect(root.attributes.size).toBe(0);
  });

  it("selects and switches back through useTheme without replacing other preferences", async () => {
    const preferences = ref({
      theme: "garden",
      language: "de",
      collectionId: "collection-1",
    });
    const root = element();
    const stopHandles: (() => void)[] = [];
    vi.stubGlobal("useViewPreferences", () => preferences);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", (...args: Parameters<typeof watch>) => {
      const stop = watch(...args);
      stopHandles.push(stop);
      return stop;
    });
    vi.stubGlobal("onMounted", (callback: () => void) => callback());
    vi.stubGlobal("document", { querySelector: () => root });
    const controller = useTheme();
    for (const theme of ["warm-habitat", "light", "dark", "homebox"] as const) {
      controller.setTheme(theme);
      await nextTick();
      expect(preferences.value).toEqual({
        theme,
        language: "de",
        collectionId: "collection-1",
      });
      expect([...root.classes]).toEqual(["locale-en", "theme-" + theme]);
    }
    stopHandles.forEach(stop => stop());
  });

  it("defines the approved palette as shared semantic HSL tokens", () => {
    const warm = stylesheet.match(/\.theme-warm-habitat \{([^}]+)\}/)![1]!;
    const expected = {
      background: "100e0e",
      "sidebar-background": "080808",
      card: "1b1818",
      primary: "b91c1c",
      foreground: "f7eee8",
      link: "ffa69b",
    };
    for (const [token, hex] of Object.entries(expected)) {
      const value = warm.match(new RegExp(`--${token}: ([\\d.]+) ([\\d.]+)% ([\\d.]+)%;`))!;
      const h = Number(value[1]) / 360,
        s = Number(value[2]) / 100,
        l = Number(value[3]) / 100;
      const a = s * Math.min(l, 1 - l);
      const rgb = [0, 8, 4]
        .map(n => {
          const k = (n + h * 12) % 12;
          return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
            .toString(16)
            .padStart(2, "0");
        })
        .join("");
      expect(rgb).toBe(hex);
    }
    expect(warm).toContain("--radius: 1rem");
    expect(warm).toContain("--font-editorial: Georgia");
    expect(warm).toContain("font-family: ui-sans-serif, system-ui, sans-serif");
  });
});
