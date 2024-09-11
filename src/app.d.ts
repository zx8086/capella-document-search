/// <reference types="@sveltejs/kit" />

/* src/app.d.ts */

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface Platform {}
  }

  interface ImportMetaEnv {
    PUBLIC_VIDEO_BASE_URL: string;
    // Add other public env variables here
  }

  interface Window {
    elasticApm: ElasticApm;
    active: false;
  }
}

export {};
