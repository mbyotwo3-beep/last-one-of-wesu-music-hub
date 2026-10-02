import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    // Some suites spawn real child processes (the catalogue importer's safety
    // rails can only be tested end-to-end, because the script has module-level
    // side effects). Those take 1-5s each and overran the 5s default whenever
    // the full suite ran in parallel on a loaded machine.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
