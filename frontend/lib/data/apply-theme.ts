import type { DaisyTheme } from "./themes";

/** Keep unrelated classes (language, layout, etc.) while replacing the active theme. */
export function applyThemeToElement(element: HTMLElement, theme: DaisyTheme) {
  const previous = Array.from(element.classList).filter(name => name === "dark" || name.startsWith("theme-"));
  element.classList.remove(...previous);
  element.setAttribute("data-theme", theme);
  element.classList.add("theme-" + theme);
}
