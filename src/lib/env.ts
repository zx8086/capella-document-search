/* src/lib/env.ts */

const isBrowser = typeof window !== "undefined";

const privateEnv: Record<string, string> = isBrowser
  ? {}
  : (Object.fromEntries(
      Object.entries(process.env).filter(([_, v]) => v != null),
    ) as Record<string, string>);

const publicEnv: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.env).filter(([_, v]) => v != null),
) as Record<string, string>;

export function getPrivateEnv(key: string): string | undefined {
  return privateEnv[key];
}

export function getPublicEnv(
  key?: string,
): string | undefined | Record<string, string> {
  if (key === undefined) {
    return publicEnv;
  }
  return publicEnv[key];
}

export function getAllEnv(): Record<string, string> {
  return { ...privateEnv, ...publicEnv };
}

console.log("Private env:", privateEnv);
console.log("Public env:", publicEnv);
