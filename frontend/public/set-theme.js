// Runs synchronously in the head, before first paint. Keep in step with
// lib/data/theme-preferences.ts (covered by the rollout parity tests).
(function () {
  const key = "homebox/preferences/location";
  const validThemes = [
    "claude",
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
  ];
  let preferences = {};
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && typeof stored === "object" && !Array.isArray(stored))
      preferences = stored;
  } catch {
    // Invalid JSON or unavailable storage must not prevent initial paint.
  }
  if (
    preferences.themeMigrationVersion !== 1 ||
    !validThemes.includes(preferences.theme)
  ) {
    preferences.theme = "claude";
  }
  preferences.themeMigrationVersion = 1;
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // Storage may be disabled or full; still apply the default.
  }
  const html = document.documentElement;
  for (const name of Array.from(html.classList)) {
    if (name.startsWith("theme-") || name === "homebox" || name === "dark")
      html.classList.remove(name);
  }
  html.setAttribute("data-theme", preferences.theme);
  html.classList.add("theme-" + preferences.theme);
})();
