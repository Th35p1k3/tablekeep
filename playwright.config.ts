import { defineConfig, devices } from "@playwright/test";

// Make .env.local settings (Supabase, test users) visible to the tests.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (for example on GitHub): settings come from CI secrets.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Fewer tests at once so a busy computer doesn't cause false failures.
  workers: process.env.CI ? 2 : 4,
  // Pages that wait on Supabase can take a few seconds, especially the first
  // time the local server builds them.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
