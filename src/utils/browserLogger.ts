/* src/utils/browserLogger.ts */

export function log(message: string, meta?: any): void {
  meta !== undefined ? console.log(message, meta) : console.log(message);
}

export function error(message: string, meta?: any): void {
  meta !== undefined ? console.error(message, meta) : console.error(message);
}

export function err(message: string, meta?: any): void {
  meta !== undefined ? console.error(message, meta) : console.error(message);
}

export function warn(message: string, meta?: any): void {
  meta !== undefined ? console.warn(message, meta) : console.warn(message);
}

export function debug(message: string, meta?: any): void {
  meta !== undefined ? console.debug(message, meta) : console.debug(message);
}
