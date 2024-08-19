/* src/utils/unifiedLogger.ts */

console.log("Unified Logger module is being imported");

import { browser } from "$app/environment";

let logImpl, errorImpl, warnImpl, debugImpl;

if (browser) {
  const browserLogger = await import("./browserLogger");
  logImpl = browserLogger.log;
  errorImpl = browserLogger.error;
  warnImpl = browserLogger.warn;
  debugImpl = browserLogger.debug;
} else {
  const serverLogger = await import("./logger");
  logImpl = serverLogger.log;
  errorImpl = serverLogger.err;
  warnImpl = serverLogger.warn;
  debugImpl = serverLogger.debug;
}

export const log = logImpl;
export const err = errorImpl;
export const warn = warnImpl;
export const debug = debugImpl;
