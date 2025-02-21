/* vite.config.minimal.ts */

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  logLevel: 'info',
  clearScreen: false
}); 