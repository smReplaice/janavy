import { defineConfig, devices } from "@playwright/test";

/**
 * JANAVI E2E suite.
 *
 * Runs against the already-running local dev server on :3000
 * (`reuseExistingServer: true` — the server is never restarted or killed by
 * the tests). Auth state is prepared once by the `setup` project
 * (tests/e2e/auth.setup.ts) and reused by every spec via storageState.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // One worker: the suite shares a single dev server, one JANAVI RDS/Redis
  // and recipient link sessions — deterministic serial execution is the
  // safest and most reproducible.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "docs/testing/playwright-report",
        open: "never",
      },
    ],
    ["json", { outputFile: "docs/testing/playwright-results.json" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    locale: "en-US",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "tests/e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "ignore",
  },
  outputDir: "docs/testing/test-results",
});
