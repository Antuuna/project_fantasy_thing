import { defineConfig } from "@playwright/test";

// These tests use the disposable local Supabase stack, never hosted credentials.
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: process.env.E2E_CONFIRMATION === '1' ? [] : ['**/confirmation/**'],
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3101" },
  webServer: {
    command: "node scripts/testing/browser-server.mjs",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
