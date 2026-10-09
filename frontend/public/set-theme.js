try {
  console.log("Setting theme");
  const theme = JSON.parse(
    localStorage.getItem("homebox/preferences/location"),
  ).theme;
  if (theme) {
    const root = document.documentElement;
    const previous = Array.from(root.classList).filter(
      (name) => name === "dark" || name.startsWith("theme-"),
    );
    root.classList.remove(...previous);
    root.setAttribute("data-theme", theme);
    root.classList.add("theme-" + theme);
  }
} catch (e) {
  console.error("Failed to set theme", e);
}
