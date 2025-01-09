/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import path from "path";
import { envSchema } from "./src/env/schema";

export default defineConfig(({ mode }): UserConfig => {
  // Add signal handling
  process.on('SIGINT', () => {
    console.log('\nGracefully shutting down from SIGINT (Ctrl+C)');
    process.exit(0);
  });

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
    const CDN_ORIGIN = "https://d2bgp0ri487o97.cloudfront.net";

    const ALLOWED_ORIGINS = [
      "https://capella-document-search.prd.shared-services.eu.pvh.cloud",
      "https://capellaql.prd.shared-services.eu.pvh.cloud",
      "https://shared-services.eu.pvh.cloud",
      CDN_ORIGIN
    ];

    // Configuration object with error handling
    const config: UserConfig = {
      plugins: [sveltekit()],
      envPrefix: ["PUBLIC_"],
      server: {
        fs: {
          allow: ['.', 'static'],
          strict: false,
        },
        port: parseInt(env.PORT || "5173"),
        host: true,
        cors: {
          origin: [
            'http://localhost:5173',
            'http://localhost:3000',
            'https://*.pinecone.io',
            'https://*.svc.*.pinecone.io',
            'https://api.openreplay.com',
            'https://openreplay.prd.shared-services.eu.pvh.cloud',
            ...ALLOWED_ORIGINS,
          ],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type', 
            'Authorization',
            'user-agent',
            'Access-Control-Allow-Headers',
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'traceparent',
            'tracestate',
            'elastic-apm-traceparent',
            'x-openreplay-session-id',
            'baggage',
            'sentry-trace',
            'Content-Encoding',
            'Cross-Origin-Opener-Policy',
            'Cross-Origin-Embedder-Policy',
            'Cross-Origin-Resource-Policy'
          ],
          exposedHeaders: [
            'traceparent',
            'tracestate',
            'elastic-apm-traceparent',
            'x-openreplay-session-id'
          ],
          credentials: true
        },
        hmr: {
          timeout: 5000
        },
        proxy: {
          '/openreplay': {
            target: env.PUBLIC_OPENREPLAY_INGEST_POINT || 'https://api.openreplay.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/openreplay/, ''),
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                // Add CORS headers to the proxy response
                proxyReq.setHeader('Access-Control-Allow-Origin', '*');
                proxyReq.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
                proxyReq.setHeader('Access-Control-Allow-Headers', [
                  'Content-Type',
                  'Authorization',
                  'traceparent',
                  'tracestate',
                  'elastic-apm-traceparent',
                  'x-openreplay-session-id'
                ].join(','));
                proxyReq.setHeader('Access-Control-Expose-Headers', [
                  'traceparent',
                  'tracestate',
                  'elastic-apm-traceparent',
                  'x-openreplay-session-id'
                ].join(','));
                
                // Preserve original headers
                if (req.headers.traceparent) {
                  proxyReq.setHeader('traceparent', req.headers.traceparent);
                }
                if (req.headers['elastic-apm-traceparent']) {
                  proxyReq.setHeader('elastic-apm-traceparent', req.headers['elastic-apm-traceparent']);
                }
              });
            }
          },
          '/ingest': {
            target: import.meta.env.DEV 
                ? 'https://api.openreplay.com'
                : 'https://openreplay.prd.shared-services.eu.pvh.cloud',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path,
            headers: {
                'Access-Control-Allow-Headers': [
                    'Content-Type',
                    'Authorization',
                    'traceparent',
                    'tracestate',
                    'elastic-apm-traceparent',
                    'x-openreplay-session-id'
                ].join(','),
                'Access-Control-Expose-Headers': [
                    'traceparent',
                    'tracestate',
                    'elastic-apm-traceparent',
                    'x-openreplay-session-id'
                ].join(',')
            }
          }
        }
      },
      ssr: {
        noExternal: ["@apollo/client", "@openreplay/tracker"],
        external: ['bun:sqlite']
      },
      build: {
        rollupOptions: {
          external: [
            'bun:sqlite',
            ...(enableOpenTelemetry
              ? [
                  "winston",
                  "winston-daily-rotate-file",
                  "@elastic/ecs-winston-format",
                  "@opentelemetry/winston-transport",
                ]
              : [])
          ]
        },
        target: "esnext",
        sourcemap: false,
      },
      optimizeDeps: {
        exclude: enableOpenTelemetry ? ["src/utils/serverLogger"] : [],
        include: [
          'svelte',
          'svelte/internal',
          'svelte/store',
          'svelte/easing',
          'bits-ui',
          'tailwind-merge'
        ],
      },
      define: {
        ...publicEnvVars,
      },
      esbuild: {
        target: "esnext",
      },
      css: {
        postcss: true,
      },
    };

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
          hmr: {
            timeout: 5000
          }
        },
      };
    }
    
    throw error;
  }
});
