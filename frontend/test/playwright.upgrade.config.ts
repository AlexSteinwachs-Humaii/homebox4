import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

// The normal config only discovers test/e2e; upgrade tests need their own testDir.
export default defineConfig({
  ...config,
  testDir: "./upgrade",
  fullyParallel: false,
});
