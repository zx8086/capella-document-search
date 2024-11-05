/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import path from "path";
import { envSchema } from "./src/env/schema";

export default defineConfig(({ mode }): UserConfig => {
  try {
    // Load environment variables
    const env = loadEnv(mode, process.cwd(), "");
    
    if (!env) {
      throw new Error("Failed to load environment variables");
    }

    // Create public env vars object with error handling
    const publicEnvVars = Object.fromEntries(
      Object.entries(env)
        .filter(([key]) => key.startsWith("PUBLIC_"))
        .map(([key, value]) => {
          if (!value) {
            console.warn(`Warning: ${key} has no value`);
            return [`import.meta.env.${key}`, '""']; // provide empty string as fallback
          }
          return [`import.meta.env.${key}`, JSON.stringify(value)]
        })
    );

    const enableOpenTelemetry = env.ENABLE_OPENTELEMETRY === "true";
    const isDevelopment = mode === "development";

    const PROD_ORIGIN = "https://shared-services.eu.pvh.cloud";

    // Configuration object with error handling
    const config: UserConfig = {
      plugins: [sveltekit()],
      envPrefix: ["PUBLIC_"],
      server: {
        fs: {
          allow: ["..", "./static"],
          strict: false,
        },
        port: parseInt(env.PORT || "5173"),
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
        sourcemap: isDevelopment,
      },
      optimizeDeps: {
        exclude: enableOpenTelemetry ? ["src/utils/serverLogger"] : [],
      },
      define: {
        ...publicEnvVars,
      },
      esbuild: {
        target: "esnext",
      },
    };

    // Validate configuration
    if (!config.plugins || !config.server || !config.build) {
      throw new Error("Invalid configuration object");
    }

    return config;

  } catch (error) {
    console.error("Vite configuration error:", error);
    
    if (mode === "development") {
      console.log("Using fallback development configuration");
      return {
        plugins: [sveltekit()],
        server: {
          port: 5173,
          host: true,
        },
      };
    }
    
    throw error; // Re-throw in production for explicit failure
  }
});
