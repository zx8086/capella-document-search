/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      strict: false,
    },
  },
  ssr: {
    noExternal: ["@apollo/client", "@openreplay/tracker"],
  },
  build: {
    rollupOptions: {
      external: [
        "winston",
        "winston-daily-rotate-file",
        "@elastic/ecs-winston-format",
        "@opentelemetry/winston-transport",
      ],
    },
  },
  optimizeDeps: {
    exclude: ["src/utils/serverLogger"],
  },
});
