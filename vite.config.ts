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
            'https://openreplay.prd.shared-services.eu.pvh.cloud'
          ],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type', 
            'Authorization',
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
          '^/ingest/v1/web/(start|not-started)': {  
            target: import.meta.env.DEV 
                ? 'https://api.openreplay.com'
                : 'https://openreplay.prd.shared-services.eu.pvh.cloud',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path,
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                try {
                  // Handle preflight requests
                  if (req.method === 'OPTIONS') {
                    proxyReq.setHeader('Access-Control-Allow-Origin', '*');
                    proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    proxyReq.setHeader('Access-Control-Allow-Headers', [
                      'Content-Type',
                      'Authorization',
                      'traceparent',
                      'tracestate',
                      'elastic-apm-traceparent',
                      'x-openreplay-session-id',
                      'baggage',
                      'sentry-trace',
                      'x-requested-with',
                      'content-encoding',
                      'accept',
                      'origin',
                      'cache-control',
                      'x-openreplay-metadata',
                      'x-openreplay-session-token'
                    ].join(', '));
                    proxyReq.setHeader('Access-Control-Max-Age', '86400');
                  }

                  // Copy original headers for all requests
                  if (req.headers) {
                    Object.keys(req.headers).forEach(key => {
                      if (req.headers[key]) {
                        proxyReq.setHeader(key, req.headers[key]);
                      }
                    });
                  }

                  // Ensure critical OpenReplay headers are set
                  const criticalHeaders = ['traceparent', 'x-openreplay-session-id'];
                  criticalHeaders.forEach(header => {
                    if (req.headers[header]) {
                      proxyReq.setHeader(header, req.headers[header]);
                    }
                  });

                } catch (error) {
                  console.error('Error in proxy request:', error);
                }
              });

              // Handle the proxy response
              proxy.on('proxyRes', (proxyRes, req, res) => {
                try {
                  proxyRes.headers['access-control-allow-origin'] = '*';
                  proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                  proxyRes.headers['access-control-allow-headers'] = [
                    'Content-Type',
                    'Authorization',
                    'traceparent',
                    'tracestate',
                    'elastic-apm-traceparent',
                    'x-openreplay-session-id',
                    'baggage',
                    'sentry-trace',
                    'x-requested-with',
                    'content-encoding',
                    'accept',
                    'origin',
                    'cache-control',
                    'x-openreplay-metadata',
                    'x-openreplay-session-token'
                  ].join(', ');

                  if (req.method === 'OPTIONS') {
                    proxyRes.statusCode = 204;
                  }
                } catch (error) {
                  console.error('Error in proxy response:', error);
                }
              });

              // Error handling
              proxy.on('error', (err, req, res) => {
                console.error('Proxy error:', err);
              });
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
