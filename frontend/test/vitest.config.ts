export default async () => {
  const { defineConfig } = await import("vitest/config");
  const path = await import("path");
  const { default: vue } = await import("@vitejs/plugin-vue");

  return defineConfig({
    plugins: [vue()],
    test: {
      globalSetup: "./test/setup.ts",
      include: ["**/*.test.ts"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, ".."),
        "~~": path.resolve(__dirname, ".."),
      },
    },
  });
};
