import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";

// Plugins shared with vitest.config.ts. Excludes `cloudflare()` (incompatible
// with `@cloudflare/vitest-pool-workers`) and `solid()` (pulls in jsdom).
export const sharedPlugins = [glsl()];

export default defineConfig({
  plugins: [...sharedPlugins, solid(), cloudflare()],
});
