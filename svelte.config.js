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
        "default-src": ["'self'"],
        "connect-src": [
          "'self'",
          ...(dev ? ["http://localhost:*"] : []),
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud",
          "https://capellaql.prd.shared-services.eu.pvh.cloud",
          "https://d2bgp0ri487o97.cloudfront.net",
          "https://eu-b2b.apm.eu-central-1.aws.cloud.es.io",
          "https://eu-b2b.apm.vpce.eu-central-1.aws.elastic-cloud.com",
          "https://apm.vpce.eu-central-1.aws.elastic-cloud.com",
          "https://apm.eu-central-1.aws.cloud.es.io",
          "https://cloudapi.cloud.couchbase.com",
          "https://openreplay.prd.shared-services.eu.pvh.cloud",
          "http://collector.prd.shared-services.eu.pvh.cloud",
          "https://apm.siobytes.com",
          "https://api.openreplay.com",
          "https://*.shared-services.eu.pvh.cloud"
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
        "form-action": [
          "'self'",
          "https://capellaql.prd.shared-services.eu.pvh.cloud",
          "https://capella-document-search.prd.shared-services.eu.pvh.cloud"
        ],
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
    csrf: {
      checkOrigin: false
    }
  },
};

export default config;
