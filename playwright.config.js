import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  outputDir: join(tmpdir(), "cscwx-weather-playwright"),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  reporter: "list",
  testDir: "./tests/browser",
  testMatch: "**/*.e2e.js",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command:
      "npm run dev:staging -- --host 127.0.0.1 --port 4173 --strictPort",
    timeout: 120000,
    url: "http://127.0.0.1:4173/version.json",
  },
  workers: 1,
});
