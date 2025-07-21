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

    const config: UserConfig = {
      plugins: [sveltekit()],
      envPrefix: ["PUBLIC_"],
      resolve: {
        alias: {
          '$app': './.svelte-kit/runtime/app',
          '$app/environment': './.svelte-kit/runtime/app/environment',
          '$app/navigation': './.svelte-kit/runtime/app/navigation',
          '$app/stores': './.svelte-kit/runtime/app/stores',
          'node:events': 'events',
          events: 'events-browserify',
          'sdp': 'sdp/sdp.js',
          // Add zen-observable alias to handle default export
          'zen-observable': path.resolve('./node_modules/zen-observable/index.js')
        },
        // Add main fields to improve module resolution
        mainFields: ['module', 'jsnext:main', 'jsnext', 'browser', 'main']
      },
      server: {
        fs: {
          allow: ['.', 'static'],
          strict: false,
        },
        port: parseInt(env.PORT || "5173"),
        host: true,
        cors: {
          origin: '*',
          methods: ['POST', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Content-Encoding',
            'X-Openreplay-Batch'
          ],
          credentials: false
        },
        hmr: {
          timeout: 5000
        },
        proxy: {
          '/openreplay': {
            target: env.PUBLIC_OPENREPLAY_INGEST_POINT,
            changeOrigin: true,
            secure: true,
            ws: true,
            headers: {
              traceparent: undefined,
              tracestate: undefined
            },
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.removeHeader('traceparent');
                proxyReq.removeHeader('tracestate');
              });
              proxy.on('error', (err, req) => {
                console.error('OpenReplay proxy error:', {
                  error: err.message,
                  path: req.path,
                  method: req.method
                });
              });
            }
          }
        }
      },
      ssr: {
        noExternal: [
          '@openfeature/web-sdk',
          '@growthbook/growthbook',
          '@openfeature/growthbook-provider',
          'langsmith'
        ],
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
          ],
          // Add output options to make module interop less strict
          output: {
            interop: 'auto',
            esModule: true,
            strict: false
          }
        },
        target: "esnext",
        sourcemap: false,
        commonjsOptions: {
          // Update to include problematic packages
          include: [
            /@openfeature\/.*/,
            /@growthbook\/.*/,
            /@openreplay\/.*/,
            /zen-observable/,
            /sdp/,
            /webrtc-adapter/,
            /node_modules/
          ],
          transformMixedEsModules: true,
          // Add this key option to make default exports work
          defaultIsModuleExports: true
        }
      },
      optimizeDeps: {
        include: [
          '@openfeature/web-sdk',
          '@growthbook/growthbook',
          '@openfeature/growthbook-provider',
          'svelte',
          'svelte/internal',
          'svelte/store',
          'svelte/easing',
          'bits-ui',
          'tailwind-merge',
          'langsmith/traceable'
        ],
        exclude: [
          'node:events',
          // Add problematic packages to exclude from pre-bundling
          '@openreplay/tracker-assist',
          '@openreplay/tracker-graphql',
          'webrtc-adapter',
          ...(enableOpenTelemetry ? ["src/utils/serverLogger"] : [])
        ],
        esbuildOptions: {
          plugins: [
            {
              name: 'sdp-resolver',
              setup(build) {
                build.onResolve({ filter: /^sdp$/ }, args => {
                  return { path: 'sdp/sdp.js', namespace: 'file' };
                });
              }
            },
            // Add zen-observable resolver
            {
              name: 'zen-observable-resolver',
              setup(build) {
                build.onResolve({ filter: /^zen-observable$/ }, args => {
                  // Make this module work with default import
                  return { path: path.resolve('./node_modules/zen-observable/index.js'), namespace: 'file' };
                });
              }
            }
          ]
        }
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
