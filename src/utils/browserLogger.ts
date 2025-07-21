/* src/utils/browserLogger.ts */

export function log(message: string, meta?: any): void {
  meta !== undefined ? console.log(message, meta) : console.log(message);
}

export function error(message: string, meta?: any): void {
  const style = 'color: red; font-weight: bold';
  if (meta !== undefined) {
    console.error(`%c${message}`, style, meta);
  } else {
    console.error(`%c${message}`, style);
  }
}

export function err(message: string, meta?: any): void {
  const style = 'color: red; font-weight: bold';
  if (meta !== undefined) {
    console.error(`%c${message}`, style, meta);
  } else {
    console.error(`%c${message}`, style);
  }
}

export function warn(message: string, meta?: any): void {
  const style = 'color: orange; font-weight: bold';
  if (meta !== undefined) {
    console.warn(`%c${message}`, style, meta);
  } else {
    console.warn(`%c${message}`, style);
  }
}

export function debug(message: string, meta?: any): void {
  const style = 'color: cyan';
  if (meta !== undefined) {
    console.debug(`%c${message}`, style, meta);
  } else {
    console.debug(`%c${message}`, style);
  }
}
