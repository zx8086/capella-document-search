/* src/utils/getEnv.ts */

import { getPrivateEnv, getPublicEnv } from "$lib/env";

export function getEnvOrThrow(key: string): string {
  const value = getPrivateEnv(key) || getPublicEnv(key);
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

export function getEnvNumberOrThrow(key: string): number {
  const value = getEnvOrThrow(key);
  const numberValue = Number(value);
  if (isNaN(numberValue)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return numberValue;
}

export function getEnvBooleanOrThrow(key: string): boolean {
  const value = getEnvOrThrow(key).toLowerCase();
  if (value !== "true" && value !== "false") {
    throw new Error(`Environment variable ${key} is not a valid boolean`);
  }
  return value === "true";
}
