import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "node_modules",
      ".next",
      "src/lib/match/__tests__/state-machine.test.ts",
      "src/lib/match/__tests__/02-seller-decision-window.test.ts",
      "src/lib/match/__tests__/03-meeting-agreement.test.ts",
    ],
    environment: "node",
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
