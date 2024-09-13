/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";

const enableOpenTelemetry = process.env.ENABLE_OPENTELEMETRY === "true";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: ["..", "./static"],
      strict: false,
    },
  },
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
      $utils: path.resolve("./src/utils"),
      models: path.resolve("./src/models"),
      $frontendConfig: path.resolve("./src/frontend-config.ts"),
      $backendConfig: path.resolve("./src/backend-config.ts"),
    },
  },
  ssr: {
    noExternal: ["@apollo/client", "@openreplay/tracker"],
  },
  build: {
    rollupOptions: {
      external: enableOpenTelemetry
        ? [
            "winston",
            "winston-daily-rotate-file",
            "@elastic/ecs-winston-format",
            "@opentelemetry/winston-transport",
          ]
        : [],
    },
    target: "esnext",
  },
  optimizeDeps: {
    exclude: enableOpenTelemetry ? ["src/utils/serverLogger"] : [],
  },
  define: {
    "process.env.ENABLE_OPENTELEMETRY": JSON.stringify(enableOpenTelemetry),
    "import.meta.env.VITE_ELASTIC_APM_SERVICE_NAME": JSON.stringify(
      process.env.VITE_ELASTIC_APM_SERVICE_NAME,
    ),
    "import.meta.env.VITE_ELASTIC_APM_SERVER_URL": JSON.stringify(
      process.env.VITE_ELASTIC_APM_SERVER_URL,
    ),
    "import.meta.env.VITE_ELASTIC_APM_SERVICE_VERSION": JSON.stringify(
      process.env.VITE_ELASTIC_APM_SERVICE_VERSION,
    ),
    "import.meta.env.VITE_ELASTIC_APM_ENVIRONMENT": JSON.stringify(
      process.env.VITE_ELASTIC_APM_ENVIRONMENT,
    ),
    "import.meta.env.VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS":
      JSON.stringify(process.env.VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS),
    "import.meta.env.VITE_OPENREPLAY_PROJECT_KEY": JSON.stringify(
      process.env.VITE_OPENREPLAY_PROJECT_KEY,
    ),
    "import.meta.env.VITE_OPENREPLAY_INGEST_POINT": JSON.stringify(
      process.env.VITE_OPENREPLAY_INGEST_POINT,
    ),
  },
  esbuild: {
    target: "esnext",
  },
});
