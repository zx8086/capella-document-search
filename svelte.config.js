/* svelte.config.js */

import adapter from "@sveltejs/adapter-node";
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
      $config: path.resolve("./src/config.ts"),
    },
  },
};

export default config;
