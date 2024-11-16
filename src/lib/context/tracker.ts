/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import type OpenReplayTracker from "@openreplay/tracker";
import trackerAssist from '@openreplay/tracker-assist';

export const key = Symbol("openreplay tracker symbol");

let trackerInstance: OpenReplayTracker | null = null;
let isInitializing = false;
let isStarted = false;

export async function initTracker() {
    if (trackerInstance && isStarted) {
        console.log("📝 Tracker already initialized and started");
        return trackerInstance;
    }

    if (isInitializing) {
        console.log("⏳ Tracker initialization already in progress");
        return null;
    }

    if (!browser) {
        console.log("🚫 Cannot initialize tracker on server side");
        return null;
    }

    try {
        isInitializing = true;
        console.log("🔍 Initializing OpenReplay tracker...");
        
        const { default: Tracker } = await import("@openreplay/tracker");
        
        trackerInstance = new Tracker({
            projectKey: frontendConfig.openreplay.PROJECT_KEY,
            ingestPoint: frontendConfig.openreplay.INGEST_POINT,
            __DISABLE_SECURE_MODE: true,
            network: {
                capturePayload: true,
                sessionTokenHeader: false,
                failuresOnly: false,
                ignoreHeaders: [
                    "Authorization",
                    "Cookie",
                    "Set-Cookie",
                    "x-csrf-token"
                ],
                sanitizer: (data) => {
                    if (data.url?.includes('/api/auth')) {
                        data.body = undefined;
                    }
                    return data;
                },
                captureInIframes: false,
                defaultFetchOptions: {
                    credentials: 'include',
                },
                ignoreUrls: [
                    '/health-check',
                    '/metrics',
                    'googleapis.com',
                    'analytics'
                ],
                maxPayloadLength: 2000,
                watchNetworkIdle: true,
                recordHeaders: true,
                recordQueryParameters: true,
                recordBody: true
            },
            console: {
                enabled: true,
                recordConsoleLog: true,
                recordConsoleWarn: true,
                recordConsoleError: true
            },
            capturePerformance: true,
            obscureTextNumbers: false,
            obscureTextEmails: false,
            respectDoNotTrack: false
        });

        trackerInstance.use(trackerAssist({
            callConfirm: "Would you like to start a support call?",
            controlConfirm: "Would you like to allow support to control your screen?",
            onCallStart: () => {
                console.log("🎥 Support call started");
                return () => console.log("📞 Support call ended");
            },
            onRemoteControlStart: () => {
                console.log("🖱️ Remote control started");
                return () => console.log("🔒 Remote control ended");
            },
            onAgentConnect: ({ email, name, query }) => {
                console.log("👋 Agent connected:", { email, name, query });
                return () => console.log("👋 Agent disconnected");
            }
        }));

        console.log("▶️ Starting tracker...");
        await trackerInstance.start();
        isStarted = true;
        console.log("✅ Tracker started successfully");

        return trackerInstance;
    } catch (error) {
        console.error("❌ Failed to initialize tracker:", error);
        trackerInstance = null;
        isStarted = false;
        return null;
    } finally {
        isInitializing = false;
    }
}

export function getTracker() {
    if (!trackerInstance || !isStarted) {
        console.warn("⚠️ Tracker not initialized or not started");
        return null;
    }
    return trackerInstance;
}

export function getSessionId(): string | null {
  if (!trackerInstance || !isStarted) return null;
  // @ts-ignore - accessing internal property
  return trackerInstance.__sessionID || null;
}

export function debugTrackerStatus() {
  console.group('🔍 OpenReplay Tracker Status');
  console.log('Tracker instance exists:', !!trackerInstance);
  console.log('Tracker started:', isStarted);
  if (trackerInstance) {
    console.log('Tracker configuration:', {
      projectKey: frontendConfig.openreplay.PROJECT_KEY,
      ingestPoint: frontendConfig.openreplay.INGEST_POINT,
    });
  }
  console.groupEnd();
}

export async function identifyUser(userId: string, metadata?: Record<string, any>) {
  const tracker = getTracker();
  if (!tracker) {
    console.warn("⚠️ Cannot identify user: tracker not initialized or not started");
    return;
  }

  try {
    console.log("👤 Identifying user:", { userId, metadata });
    await tracker.setUserID(userId);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        await tracker.setMetadata(key, String(value));
      }
    }
    console.log("✅ User identification complete");
  } catch (error) {
    console.error("❌ Failed to identify user:", error);
  }
}

export function trackEvent(eventName: string, metadata: Record<string, any> = {}) {
    const tracker = getTracker();
    if (!tracker) {
        console.warn("⚠️ Cannot track event: tracker not initialized");
        return;
    }

    try {
        const enrichedMetadata = {
            ...metadata,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: window.navigator.userAgent,
        };

        tracker.event(eventName, enrichedMetadata);
        console.log("📊 Event tracked:", { eventName, metadata: enrichedMetadata });
    } catch (error) {
        console.error("❌ Failed to track event:", error);
    }
}
