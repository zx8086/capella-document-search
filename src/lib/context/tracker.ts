/* src/lib/context/tracker.ts */

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
