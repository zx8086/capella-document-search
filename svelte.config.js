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
      $frontendConfig: path.resolve("./src/frontend-config.ts"),
      $backendConfig: path.resolve("./src/backend-config.ts"),
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
          "https://apm.vpce.eu-central-1.aws.elastic-cloud.com",
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
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "worker-src": ["'self'", "blob:"],
        "media-src": ["'self'", "blob:"],
        "child-src": ["'self'", "blob:"],
      },
    },
  },
};

export default config;
