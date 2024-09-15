/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_");

  const enableOpenTelemetry = env.ENABLE_OPENTELEMETRY === "true";

  return {
    plugins: [sveltekit()],
    server: {
      fs: {
        allow: ["..", "./static"],
        strict: false,
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
      "process.env.PUBLIC_ELASTIC_APM_SERVICE_NAME": JSON.stringify(
        process.env.PUBLIC_ELASTIC_APM_SERVICE_NAME,
      ),
      "process.env.PUBLIC_ELASTIC_APM_SERVER_URL": JSON.stringify(
        process.env.PUBLIC_ELASTIC_APM_SERVER_URL,
      ),
      "process.env.PUBLIC_ELASTIC_APM_SERVICE_VERSION": JSON.stringify(
        process.env.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
      ),
      "process.env.PUBLIC_ELASTIC_APM_ENVIRONMENT": JSON.stringify(
        process.env.PUBLIC_ELASTIC_APM_ENVIRONMENT,
      ),
      "import.meta.env.PUBLIC_OPENREPLAY_PROJECT_KEY": JSON.stringify(
        process.env.PUBLIC_OPENREPLAY_PROJECT_KEY,
      ),
      "import.meta.env.PUBLIC_OPENREPLAY_INGEST_POINT": JSON.stringify(
        process.env.PUBLIC_OPENREPLAY_INGEST_POINT,
      ),
    },
    esbuild: {
      target: "esnext",
    },
  };
});
