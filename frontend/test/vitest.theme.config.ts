import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Theme checks are client-only and do not need the API integration global setup.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/claude*.test.ts"],
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("..", import.meta.url)),
      "~~": fileURLToPath(new URL("..", import.meta.url)),
    },
  },
});
