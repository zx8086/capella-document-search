/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import type OpenReplayTracker from "@openreplay/tracker";
import trackerAssist from '@openreplay/tracker-assist';
import trackerProfiler from '@openreplay/tracker-profiler';
import { createTrackerLink } from '@openreplay/tracker-graphql';
import { toast } from 'svelte-sonner';
import type { IFeatureFlag } from '@openreplay/tracker';

export const key = Symbol("openreplay tracker symbol");

let trackerInstance: OpenReplayTracker | null = null;
let isInitializing = false;
let isStarted = false;
let graphqlTracker: any = null;
let cachedFlags: Record<string, boolean> = {};
let flagsInitialized = false;
let flagsInitializationPromise: Promise<void> | null = null;

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
                console.log("🎥 Support call started - checking DOM state");
                const overlays = document.querySelectorAll('.fixed.inset-0');
                console.log("Current overlay elements:", overlays);
                
                toast.info("Support call started", {
                    description: "You are now connected to a support session",
                    duration: Infinity
                });
                return () => {
                    console.log("📞 Support call ended - checking DOM state");
                    const overlays = document.querySelectorAll('.fixed.inset-0');
                    console.log("Overlay elements at end:", overlays);
                    
                    toast.info("Support call ended", {
                        description: "Your support session has ended",
                        duration: Infinity
                    });
                };
            },
            onRemoteControlStart: () => {
                console.log("🖱️ Remote control started");
                toast.info("Remote control active", {
                    description: "Support agent now has control of your screen",
                    duration: Infinity
                });
                return () => {
                    console.log("🔒 Remote control ended");
                    toast.info("Remote control ended", {
                        description: "Support agent no longer has control of your screen",
                        duration: Infinity
                    });
                };
            },
            onAgentConnect: (agentInfo: any = {}) => {
                const { email = '', name = '', query = '' } = agentInfo;
                console.log("👋 Agent connected:", { email, name, query });
                toast.info("Support agent connected", {
                    description: `${name} (${email}) has joined the session`,
                    duration: Infinity
                });
                return () => {
                    console.log("👋 Agent disconnected");
                    toast.info("Support agent disconnected", {
                        description: "The support agent has left the session",
                        duration: Infinity
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

        // Initialize feature flags right after tracker starts
        await initFeatureFlags();

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

export async function waitForTracker(timeout = 5000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const tracker = getTracker();
        if (tracker) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn('⏱️ Tracker initialization timeout');
    return false;
}

export async function initFeatureFlags(): Promise<void> {
    // If flags are already initialized, return
    if (flagsInitialized) {
        console.debug('🚩 Feature flags already initialized');
        return;
    }

    // If initialization is in progress, return the existing promise
    if (flagsInitializationPromise) {
        console.debug('⏳ Feature flags initialization in progress');
        return flagsInitializationPromise;
    }

    const tracker = getTracker();
    if (!tracker) {
        console.warn('⚠️ Cannot initialize feature flags: No tracker instance');
        return;
    }

    flagsInitializationPromise = new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('⏱️ Feature flags load timeout');
            flagsInitialized = true;
            resolve();
        }, 5000); // 5 second timeout

        tracker.onFlagsLoad((flags: IFeatureFlag[]) => {
            clearTimeout(timeout);
            console.debug('🚩 Feature Flags Loaded:', {
                flags: flags.map(f => ({ key: f.key, enabled: f.value })),
                timestamp: new Date().toISOString()
            });
            flagsInitialized = true;
            resolve();
        });

        // Force reload flags
        tracker.reloadFlags();
    });

    return flagsInitializationPromise;
}

export async function getFeatureFlag(key: string): Promise<boolean> {
    const tracker = getTracker();
    if (!tracker) {
        console.debug('🚫 Feature flag check failed: No tracker instance', {
            key,
            timestamp: new Date().toISOString()
        });
        return false;
    }

    try {
        // Ensure flags are initialized
        if (!flagsInitialized) {
            console.debug('⏳ Initializing feature flags...');
            await initFeatureFlags();
        }

        // Use the direct flag access method
        const flag = tracker.getFeatureFlag(key);
        const isEnabled = flag?.value === true;
        
        console.debug('🎌 Feature Flag Check:', {
            key,
            isEnabled,
            flag,
            trackerActive: true,
            timestamp: new Date().toISOString()
        });

        return isEnabled;
    } catch (error) {
        console.warn('⚠️ Feature flag check error:', {
            key,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
        return false;
    }
}

export function setupFeatureFlagListener(): void {
    const tracker = getTracker();
    if (!tracker) return;

    tracker.onFlagsLoad((flags: IFeatureFlag[]) => {
        console.debug('🚩 Feature Flags Loaded:', {
            flags: flags.map(f => ({ key: f.key, enabled: f.value })),
            timestamp: new Date().toISOString()
        });
    });
}
