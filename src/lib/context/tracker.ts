/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import type OpenReplayTracker from "@openreplay/tracker";

export const key = Symbol("openreplay tracker symbol");

let Tracker: typeof OpenReplayTracker | null = null;

export async function initTracker() {
  if (typeof window !== "undefined" && !Tracker) {
    const module = await import("@openreplay/tracker");
    Tracker = module.default;
  }
  return Tracker;
}

export { Tracker };

export function getTracker() {
    return Tracker;
}

export function identify(userId: string, metadata?: Record<string, any>) {
    if (!Tracker) return;
    Tracker.identify(userId, metadata);
}

export function trackEvent(name: string, payload?: Record<string, any>) {
    if (!Tracker) return;
    Tracker.event(name, payload);
}
