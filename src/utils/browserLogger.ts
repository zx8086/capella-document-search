/* src/utils/browserLogger.ts */

export function log(message: string, meta?: any): void {
  console.log(message, meta);
}

export function error(message: string, meta?: any): void {
  console.error(message, meta);
}

export function warn(message: string, meta?: any): void {
  console.warn(message, meta);
}

export function debug(message: string, meta?: any): void {
  console.debug(message, meta);
}
