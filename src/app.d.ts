/* src/app.d.ts */

/// <reference types="@sveltejs/kit" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Error {}
    interface Locals {
      nonce: string;
    }
    interface PageData {}
    interface Platform {}
  }

  interface Window {
    elasticApm?: ElasticApm;
  }

  interface ElasticApm {
    init: (config: any) => void;
  }
}

export {};
