/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import Tracker from '@openreplay/tracker';

let tracker: Tracker | null = null;

export const key = Symbol();

export function initTracker() {
    if (!browser || tracker) return tracker;

    tracker = new Tracker({
        projectKey: frontendConfig.openreplay.PROJECT_KEY,
        ingestPoint: frontendConfig.openreplay.INGEST_POINT,
        __DISABLE_SECURE_MODE: true,
    });

    tracker.start();
    return tracker;
}

export function identify(userId: string, metadata?: Record<string, any>) {
    if (!tracker) return;
    tracker.identify(userId, metadata);
}

export function trackEvent(name: string, payload?: Record<string, any>) {
    if (!tracker) return;
    tracker.event(name, payload);
}
