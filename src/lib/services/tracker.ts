import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import { initTracker } from '$lib/context/tracker';

class TrackerService {
    private static instance: TrackerService;
    private trackerInstance: any = null;

    private constructor() {}

    static getInstance(): TrackerService {
        if (!TrackerService.instance) {
            TrackerService.instance = new TrackerService();
        }
        return TrackerService.instance;
    }

    async init() {
        if (!browser || this.trackerInstance) return;

        try {
            const Tracker = await initTracker();
            if (Tracker && frontendConfig.openreplay.PROJECT_KEY) {
                this.trackerInstance = new Tracker({
                    projectKey: frontendConfig.openreplay.PROJECT_KEY,
                    ingestPoint: frontendConfig.openreplay.INGEST_POINT,
                    obscureTextNumbers: false,
                    obscureTextEmails: true,
                    __DISABLE_SECURE_MODE: true,
                });
            }
        } catch (error) {
            console.error('Failed to initialize tracker:', error);
        }
    }

    identify(userId: string, metadata?: Record<string, any>) {
        if (!this.trackerInstance) return;
        try {
            this.trackerInstance.identify(userId, metadata);
        } catch (error) {
            console.error('Tracker identify failed:', error);
        }
    }

    trackEvent(name: string, payload?: Record<string, any>) {
        if (!this.trackerInstance) return;
        try {
            this.trackerInstance.event(name, payload);
        } catch (error) {
            console.error('Tracker event failed:', error);
        }
    }

    start() {
        if (!this.trackerInstance) return;
        try {
            this.trackerInstance.start();
        } catch (error) {
            console.error('Tracker start failed:', error);
        }
    }
}

export const tracker = TrackerService.getInstance(); 