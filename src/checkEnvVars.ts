/* src/checkEnvVars.ts */

import { getPrivateEnv, getPublicEnv } from "$lib/env";

export function getEnvOrThrow(key: string): string {
  const privateValue = getPrivateEnv(key);
  const publicValue = getPublicEnv(key);

  const value = privateValue !== undefined ? privateValue : publicValue;

  if (value === undefined || typeof value !== "string") {
    throw new Error(
      `Environment variable ${key} is not set or is not a string`,
    );
  }
  return value;
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  const privateValue = getPrivateEnv(key);
  const publicValue = getPublicEnv(key);

  const value = privateValue !== undefined ? privateValue : publicValue;

  return value !== undefined ? value : defaultValue;
}

export function getEnvNumberOrThrow(key: string): number {
  const value = getEnvOrThrow(key);
  const numberValue = Number(value);
  if (isNaN(numberValue)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return numberValue;
}

export function getEnvNumberOrDefault(
  key: string,
  defaultValue: number,
): number {
  const value = getEnvOrDefault(key, defaultValue.toString());
  const numberValue = Number(value);
  return isNaN(numberValue) ? defaultValue : numberValue;
}

export function getEnvBooleanOrThrow(key: string): boolean {
  const value = getEnvOrThrow(key);
  console.log(
    `Checking boolean env var ${key}, raw value: "${value}", type: ${typeof value}`,
  );
  if (value === undefined || value === "") {
    throw new Error(`Environment variable ${key} is not set`);
  }
  const lowercaseValue = value.toLowerCase();
  if (lowercaseValue !== "true" && lowercaseValue !== "false") {
    throw new Error(
      `Environment variable ${key} is not a valid boolean. Got: "${value}"`,
    );
  }
  return lowercaseValue === "true";
}

export function getEnvBooleanOrDefault(
  key: string,
  defaultValue: boolean,
): boolean {
  const value = getEnvOrDefault(key, defaultValue.toString()).toLowerCase();
  return value === "true" ? true : value === "false" ? false : defaultValue;
}
