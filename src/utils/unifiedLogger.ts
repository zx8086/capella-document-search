/* src/utils/unifiedLogger.ts */

// Replace the direct import with a runtime check
const isBrowser = typeof window !== 'undefined';
import type { BackendConfig } from "../models/types";

let serverLogger: any = null;

// Initialize the logger
export async function initializeLogger(config?: BackendConfig) {
  if (!isBrowser && !serverLogger) {
    serverLogger = await import("./serverLogger");
    if (config) {
      serverLogger.initializeLogger(config);
    }
  }
}

// Initialize immediately in non-browser environments
if (!isBrowser) {
  initializeLogger();
}

export function log(message: string, meta?: any): void {
  if (isBrowser) {
    console.log(message, meta);
  } else {
    serverLogger?.log(message, meta);
  }
}

export function err(message: string, meta?: any): void {
  if (isBrowser) {
    console.error(message, meta);
  } else {
    serverLogger?.err(message, meta);
  }
}

export function warn(message: string, meta?: any): void {
  if (isBrowser) {
    console.warn(message, meta);
  } else {
    serverLogger?.warn(message, meta);
  }
}

export function debug(message: string, meta?: any): void {
  if (isBrowser) {
    console.debug(message, meta);
  } else {
    serverLogger?.debug(message, meta);
  }
}
