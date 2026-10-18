import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite reads the "@/..." shortcuts from tsconfig.json itself.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Makes .env.local settings (Supabase, test users) available to tests.
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Test files share the same test accounts, so run them one at a time.
    fileParallelism: false,
  },
});
