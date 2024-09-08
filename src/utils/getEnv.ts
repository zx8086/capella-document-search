/* src/utils/getEnv.ts */

let isBrowser = false;

try {
  isBrowser = Boolean(window);
} catch (e) {
  // Not in a browser environment
}

export function getEnvBooleanOrThrow(key: string): boolean {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value.toLowerCase() === "true";
}

export function getEnvOrThrow(key: string): string {
  let value;
  if (isBrowser) {
    value = import.meta.env[key];
  } else {
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
