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
      precompress: false,
      runtime: 'bun',
      serverBunOptions: {
        target: 'bun',
        platform: 'bun'
      }
    }),
    files: {
      assets: 'static',
    },
    paths: {
      assets: '',
    },
    alias: {
      $lib: path.resolve("./src/lib"),
      $utils: path.resolve("./src/utils"),
      $models: path.resolve("./src/models"),
      $frontendConfig: path.resolve("./src/frontend-config.ts"),
      $backendConfig: path.resolve("./src/backend-config.ts"),
      "$env/static/private": path.resolve("./src/env/static/private.ts"),
      "$env/static/public": path.resolve("./src/env/static/public.ts"),
      '$app': path.resolve('./.svelte-kit/runtime/app'),
      '$app/environment': path.resolve('./.svelte-kit/runtime/app/environment'),
      '$app/navigation': path.resolve('./.svelte-kit/runtime/app/navigation'),
      '$app/stores': path.resolve('./.svelte-kit/runtime/app/stores')
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
          "wss://api.openreplay.com",
          "wss://openreplay.prd.shared-services.eu.pvh.cloud",
          "ws://api.openreplay.com",
          "https://api.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          // OpenReplay minimal required configuration
          "https://api.openreplay.com",
          "wss://api.openreplay.com",
          "ws://api.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          "wss://openreplay.prd.shared-services.eu.pvh.cloud",
          "ws://openreplay.prd.shared-services.eu.pvh.cloud",
          // Add these new entries for metadata/logging
          "https://*.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud/*",
          // Other necessary endpoints
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud",
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
        'media-src': ["'self'", "https://*.cloudfront.net"],
        'script-src': [
          "'self'",
          "'unsafe-eval'",
          "https://api.openreplay.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud"
        ],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud",
          "https://openreplay.prd.shared-services.eu.pvh.cloud"
        ],
        'img-src': [
          "'self'", 
          "data:", 
          "blob:",
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud",
          "https://openreplay.prd.shared-services.eu.pvh.cloud"
        ],
        'font-src': [
          "'self'", 
          "data:",
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud"
        ],
        'frame-src': [
          "'self'",
          "https://login.microsoftonline.com",
          "https://*.microsoftonline.com"
        ],
        'worker-src': ["'self'", "blob:"],
        'child-src': ["'self'", "blob:"]
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
