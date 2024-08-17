/* vite.config.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path"; // Import the path module to resolve paths

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      $lib: path.resolve("src/lib"),
      $models: path.resolve("src/models"),
    },
  },
  server: {
    fs: {
      strict: false,
    },
  },
});
