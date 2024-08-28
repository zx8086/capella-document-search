/* src/utils.ts */

export function getEnvOrThrow(key: string): string {
  const value =
    typeof process !== "undefined" && process.env
      ? process.env[key]
      : import.meta.env[key];

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
