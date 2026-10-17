import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite reads the "@/..." shortcuts from tsconfig.json itself.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
