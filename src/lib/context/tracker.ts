/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import Tracker from '@openreplay/tracker';

let tracker: any = null;

export const key = Symbol();

export async function initTracker() {
    if (!browser) return null;
    
    try {
        const Tracker = (await import('@openreplay/tracker')).default;
        return Tracker;
    } catch (error) {
        console.error('Failed to import OpenReplay tracker:', error);
        return null;
    }
}

export function identify(userId: string, metadata?: Record<string, any>) {
    if (!tracker) return;
    tracker.identify(userId, metadata);
}

export function trackEvent(name: string, payload?: Record<string, any>) {
    if (!tracker) return;
    tracker.event(name, payload);
}
