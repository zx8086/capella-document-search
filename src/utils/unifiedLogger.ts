/* src/utils/unifiedLogger.ts */

import { browser } from "$app/environment";
import type { BackendConfig } from "../models/types";

let serverLogger: any = null;

// Initialize the logger
export async function initializeLogger(config?: BackendConfig) {
  if (!browser && !serverLogger) {
    serverLogger = await import("./serverLogger");
    if (config) {
      serverLogger.initializeLogger(config);
    }
  }
}

// Initialize immediately in non-browser environments
if (!browser) {
  initializeLogger();
}

export function log(message: string, meta?: any): void {
  if (browser) {
    console.log(message, meta);
  } else {
    serverLogger?.log(message, meta);
  }
}

export function err(message: string, meta?: any): void {
  if (browser) {
    console.error(message, meta);
  } else {
    serverLogger?.err(message, meta);
  }
}

export function warn(message: string, meta?: any): void {
  if (browser) {
    console.warn(message, meta);
  } else {
    serverLogger?.warn(message, meta);
  }
}

export function debug(message: string, meta?: any): void {
  if (browser) {
    console.debug(message, meta);
  } else {
    serverLogger?.debug(message, meta);
  }
}
