/* svelte.config.js */

import adapter from "svelte-adapter-bun";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import path from "path";

const dev = process.env.NODE_ENV === 'development';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      dynamic_origin: true,
      precompress: false
    }),
    alias: {
      $lib: path.resolve("./src/lib"),
      $utils: path.resolve("./src/utils"),
      $models: path.resolve("./src/models"),
      $frontendConfig: path.resolve("./src/frontend-config.ts"),
      $backendConfig: path.resolve("./src/backend-config.ts"),
      "$env/static/private": path.resolve("./src/env/static/private.ts"),
      "$env/static/public": path.resolve("./src/env/static/public.ts"),
    },
    env: {
      dir: process.cwd(),
      publicPrefix: "PUBLIC_",
    },
    csp: {
      mode: "auto",
      directives: {
        'default-src': ["'self'"],
        'connect-src': [
          "'self'",
          // OpenReplay minimal required configuration
          "https://api.openreplay.com",
          "wss://api.openreplay.com",
          "ws://api.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          "wss://openreplay.prd.shared-services.eu.pvh.cloud",
          "ws://openreplay.prd.shared-services.eu.pvh.cloud",
          // Other necessary endpoints
          "https://login.microsoftonline.com",
          "https://*.microsoftonline.com",
          "https://graph.microsoft.com",
          "https://*.graph.microsoft.com",
          "https://api.openai.com",
          "https://*.pinecone.io",
          "https://*.svc.pinecone.io",
          "https://*.shared-services.eu.pvh.cloud",
          "https://*.cloudfront.net",
          "https://*.aws.cloud.es.io",
          "https://*.aws.elastic-cloud.com",
          "https://*.cloud.couchbase.com",
          "https://*.siobytes.com",
          "https://eu-b2b.apm.eu-central-1.aws.cloud.es.io",
          // Development endpoints
          ...(dev ? ["ws://localhost:*", "http://localhost:*"] : [])
        ],
        'script-src': [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://api.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud"
        ],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", "data:", "blob:"],
        'font-src': ["'self'", "data:"],
        'frame-src': [
          "'self'",
          "https://login.microsoftonline.com",
          "https://*.microsoftonline.com"
        ],
        'worker-src': ["'self'", "blob:"]
      }
    },
    csrf: {
      checkOrigin: false
    }
  },
  vitePlugin: {
    inspector: true
  },
};

export default config;
