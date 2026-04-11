import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { sharedAliases, sharedPlugins } from "./vite.config";

export default defineConfig({
  plugins: sharedPlugins,
  resolve: {
    alias: sharedAliases,
  },
  test: {
    projects: [
      {
        resolve: { alias: sharedAliases },
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**"],
          environment: "node",
        },
      },
      {
        resolve: { alias: sharedAliases },
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
