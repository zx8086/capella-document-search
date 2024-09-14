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
    // resolve: {
    //   alias: {
    //     $lib: path.resolve("./src/lib"),
    //     $utils: path.resolve("./src/utils"),
    //     models: path.resolve("./src/models"),
    //     $frontendConfig: path.resolve("./src/frontend-config.ts"),
    //     $backendConfig: path.resolve("./src/backend-config.ts"),
    //   },
    // },
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
      // Expose public env variables to the client
      ...Object.keys(env).reduce((acc, key) => {
        acc[`import.meta.env.${key}`] = JSON.stringify(env[key]);
        return acc;
      }, {}),
    },
    esbuild: {
      target: "esnext",
    },
  };
});
