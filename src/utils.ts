/* src/utils.ts */

let isBrowser = false;

// Check if we're in a browser environment
try {
  isBrowser = Boolean(window);
} catch (e) {
  // Not in a browser environment
}

export function getEnvOrThrow(key: string): string {
  let value;
  if (isBrowser) {
    // Client-side
    value = import.meta.env[key];
  } else {
    // Server-side
    value = process.env[key];
  }

  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function getEnvNumberOrThrow(key: string): number {
  const value = getEnvOrThrow(key);
  const numberValue = Number(value);
  if (isNaN(numberValue)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return numberValue;
}
