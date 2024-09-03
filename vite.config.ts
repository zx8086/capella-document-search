/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";

const disableOpenTelemetry = process.env.DISABLE_OPENTELEMETRY === "true";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      strict: false,
    },
  },
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
      $utils: path.resolve("./src/utils"),
      $config: path.resolve("./src/backend-config.ts"),
    },
  },
  ssr: {
    noExternal: ["@apollo/client", "@openreplay/tracker"],
  },
  build: {
    rollupOptions: {
      external: disableOpenTelemetry
        ? []
        : [
            "winston",
            "winston-daily-rotate-file",
            "@elastic/ecs-winston-format",
            "@opentelemetry/winston-transport",
          ],
    },
    target: "esnext",
  },
  optimizeDeps: {
    exclude: disableOpenTelemetry ? [] : ["src/utils/serverLogger"],
  },
  define: disableOpenTelemetry
    ? {
        "process.env.DISABLE_OPENTELEMETRY": JSON.stringify("true"),
      }
    : {},
  esbuild: {
    target: "esnext",
  },
});
