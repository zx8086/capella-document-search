/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";
import path from "path";
import { envSchema } from "./src/env/schema";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_");

  // Automatically create define object from schema
  const defineObj = Object.entries(env).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [`import.meta.env.${key}`]: JSON.stringify(value),
    }),
    {},
  );

  const enableOpenTelemetry = env.ENABLE_OPENTELEMETRY === "true";
  const isDevelopment = mode === "development";

  const PROD_ORIGIN = "https://shared-services.eu.pvh.cloud";

  return {
    plugins: [sveltekit()],
    envPrefix: ["PUBLIC_"],
    server: {
      fs: {
        allow: ["..", "./static"],
        strict: false,
      },
      port: 5173,
      host: true,
      cors: isDevelopment
        ? {
            origin: [
              "http://localhost:5173",
              "http://localhost:3000",
              PROD_ORIGIN,
              /\.shared-services\.eu\.pvh\.cloud$/,
            ],
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
            credentials: true,
          }
        : false,
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
    define: defineObj,
    esbuild: {
      target: "esnext",
    },
  };
});
