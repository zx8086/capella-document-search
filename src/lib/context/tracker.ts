/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import type OpenReplayTracker from "@openreplay/tracker";
import trackerAssist from '@openreplay/tracker-assist';
import trackerProfiler from '@openreplay/tracker-profiler';
import { createTrackerLink } from '@openreplay/tracker-graphql';
import { toast } from 'svelte-sonner';

export const key = Symbol("openreplay tracker symbol");

let trackerInstance: OpenReplayTracker | null = null;
let isInitializing = false;
let isStarted = false;
let graphqlTracker: any = null;

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
                    if (data.url?.includes('/graphql')) {
                        if (data.body?.variables?.password) {
                            data.body.variables.password = '***';
                        }
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
                toast.info("Support call started", {
                    description: "You are now connected to a support session"
                });
                return () => {
                    console.log("📞 Support call ended");
                    toast.info("Support call ended", {
                        description: "Your support session has ended",
                    });
                };
            },
            onRemoteControlStart: () => {
                console.log("🖱️ Remote control started");
                toast.warning("Remote control active", {
                    description: "Support agent now has control of your screen",
                });
                return () => {
                    console.log("🔒 Remote control ended");
                    toast.info("Remote control ended", {
                        description: "Support agent no longer has control of your screen"
                    });
                };
            },
            onAgentConnect: ({ email, name, query }) => {
                console.log("👋 Agent connected:", { email, name, query });
                toast.success("Support agent connected", {
                    description: `${name} (${email}) has joined the session`
                });
                return () => {
                    console.log("👋 Agent disconnected");
                    toast.info("Support agent disconnected", {
                        description: "The support agent has left the session"
                    });
                };
            }
        }));

        trackerInstance.use(trackerProfiler({
            sampleRate: 50,
            capturePerformance: true,
            captureMemory: true,
            captureNetwork: true,
            networkHeuristics: true,
            logPerformance: true,
            logMemory: true,
            logNetwork: true
        }));

        graphqlTracker = trackerInstance.use(createTrackerLink((variables) => {
            const sanitized = { ...variables };
            if (sanitized.password) sanitized.password = '***';
            if (sanitized.token) sanitized.token = '***';
            if (sanitized.apiKey) sanitized.apiKey = '***';
            return sanitized;
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
    await tracker.setUserID(metadata?.email || userId);
    if (metadata) {
      await tracker.setMetadata('name', metadata.name || '');
      await tracker.setMetadata('accountId', userId);
      await tracker.setMetadata('email', metadata.email || '');
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

export function getGraphQLTracker() {
    return graphqlTracker;
}
