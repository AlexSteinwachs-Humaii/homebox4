// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, createApp, defineComponent, nextTick, onMounted, ref, watch } from "vue";
import { darkThemes, themes } from "../lib/data/themes";
import type { DaisyTheme } from "../lib/data/themes";
import { useTheme } from "../composables/use-theme";

const css = readFileSync("assets/css/main.css", "utf8");
const block = css.match(/\.theme-claude\s*\{([^}]+)\}/)![1]!;
const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));

function luminance(token: string) {
  const [h, s, l] = tokens[token].match(/[\d.]+/g)!.map(Number) as [number, number, number];
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const rgb = [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

afterEach(() => vi.unstubAllGlobals());

describe("Claude palette", () => {
  it("registers a light Claude option without dropping existing options", () => {
    expect(themes.find(t => t.value === "claude")).toEqual({
      label: "Claude",
      value: "claude",
    });
    expect(darkThemes).not.toContain("claude");
    expect(themes.filter(t => t.value !== "claude").map(t => t.value)).toEqual([
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
  });

  it("defines every existing palette token explicitly and preserves layout radius", () => {
    const baseline = css.match(/:root,\.homebox\s*\{([^}]+)\}/)![1]!;
    const keys = [...baseline.matchAll(/--([\w-]+):/g)].map(m => m[1]);
    expect(Object.keys(tokens).sort()).toEqual(keys.sort());
    expect(tokens.radius).toBe("0.5rem");
  });

  it("has AA text contrast and visible focus/input boundaries on cream surfaces", () => {
    const pairs: [string, string][] = [
      ["background", "foreground"],
      ["background-accent", "foreground"],
      ["card", "card-foreground"],
      ["popover", "popover-foreground"],
      ["primary", "primary-foreground"],
      ["secondary", "secondary-foreground"],
      ["accent", "accent-foreground"],
      ["muted", "muted-foreground"],
      ["destructive", "destructive-foreground"],
      ["sidebar-background", "sidebar-foreground"],
      ["sidebar-primary", "sidebar-primary-foreground"],
      ["sidebar-accent", "sidebar-accent-foreground"],
      ["background", "destructive"],
    ];
    for (const [bg, fg] of pairs) expect(contrast(bg, fg), `${bg}/${fg}`).toBeGreaterThanOrEqual(4.5);
    for (const surface of ["background", "card", "popover", "sidebar-background", "accent"]) {
      for (const indicator of ["ring", "sidebar-ring", "input", "border"]) {
        expect(contrast(surface, indicator), `${surface}/${indicator}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("applies preferences on mount and switches all options without stale theme classes", async () => {
    const preferences = ref<{ theme: DaisyTheme }>({ theme: "claude" });
    for (const [name, value] of Object.entries({
      computed,
      ref,
      onMounted,
      watch,
      useViewPreferences: () => preferences,
    })) {
      vi.stubGlobal(name, value);
    }
    const html = document.documentElement;
    html.className = "homebox dark theme-night theme-unknown unrelated";
    let themeApi!: ReturnType<typeof useTheme>;
    const app = createApp(
      defineComponent({
        setup() {
          themeApi = useTheme();
          return () => null;
        },
      })
    );
    const host = document.createElement("div");
    app.mount(host);
    try {
      for (const theme of ["claude", ...themes.map(t => t.value), "dark", "claude"] as DaisyTheme[]) {
        themeApi.setTheme(theme);
        await nextTick();
        expect(html.dataset.theme).toBe(theme);
        expect([...html.classList]).toEqual(["unrelated", `theme-${theme}`]);
        expect(preferences.value.theme).toBe(theme);
      }
    } finally {
      app.unmount();
      html.className = "";
      delete html.dataset.theme;
    }
  });
});
