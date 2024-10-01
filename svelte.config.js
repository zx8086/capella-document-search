/* svelte.config.js */

import adapter from "svelte-adapter-bun";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import path from "path";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
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
        "default-src": ["'self'"],
        "connect-src": [
          "'self'",
          "https://eu-b2b.apm.eu-central-1.aws.cloud.es.io",
          "https://eu-b2b.apm.vpce.eu-central-1.aws.elastic-cloud.com",
          "https://apm.vpce.eu-central-1.aws.elastic-cloud.com",
          "https://apm.eu-central-1.aws.cloud.es.io",
          "https://cloudapi.cloud.couchbase.com",
          "https://capellaql.prd.shared-services.eu.pvh.cloud",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          "http://collector.prd.shared-services.eu.pvh.cloud",
          "https://apm.siobytes.com",
          "https://api.openreplay.com",
        ],
        "script-src": [
          "'self'",
          "https://vjs.zencdn.net",
          "'unsafe-inline'",
          "blob:",
        ],
        "style-src": ["'self'", "https://vjs.zencdn.net", "'unsafe-inline'"],
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://d2bgp0ri487o97.cloudfront.net",
        ],
        "font-src": ["'self'", "data:"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "worker-src": ["'self'", "blob:"],
        "media-src": [
          "'self'",
          "blob:",
          "https://d2bgp0ri487o97.cloudfront.net",
        ],
        "child-src": ["'self'", "blob:"],
      },
    },
  },
};

export default config;
