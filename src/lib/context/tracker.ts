/* src/lib/context/tracker.ts */

import { browser } from '$app/environment';
import { frontendConfig } from '$frontendConfig';
import Tracker from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';
import trackerProfiler from '@openreplay/tracker-profiler';
import { createTrackerLink } from '@openreplay/tracker-graphql';
import { toast } from 'svelte-sonner';
import type { IFeatureFlag } from '@openreplay/tracker';
import apm from '../../apm-config';
import { get } from 'svelte/store';
import { userAccount } from '$lib/stores/authStore';
import { storageAccess, debugStorageAccess } from '$lib/utils/storage';

// Remove the direct import of userAccount
// import { userAccount } from '$lib/stores/authStore';

// Instead, create a function to set the user later
let setUserCallback: ((username: string) => void) | null = null;

export const key = Symbol("openreplay tracker symbol");

let trackerInstance: Tracker | null = null;
let isInitializing = false;
let isStarted = false;
let graphqlTracker: any = null;
let cachedFlags: Record<string, boolean> = {};
let flagsInitialized = false;
let flagsInitializationPromise: Promise<void> | null = null;
let initializationPromise: Promise<Tracker | null> | null = null;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000;

// Add storage key for tracker state
const TRACKER_STATE_KEY = 'openreplay_tracker_initialized';

// Add session storage key for tracker state
const TRACKER_SESSION_KEY = 'openreplay_session_active';

const isSafari = browser && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const getIngestPoint = () => {
    // Make sure we're using the correct production endpoint
    return import.meta.env.DEV 
        ? 'https://api.openreplay.com/ingest'
        : 'https://openreplay.prd.shared-services.eu.pvh.cloud/ingest';
};

const getResourceBaseHref = () => {
    return import.meta.env.DEV 
        ? 'http://localhost:5173'
        : 'https://capella-document-search.prd.shared-services.eu.pvh.cloud';
};

export async function initTracker() {
    // Add check for existing session
    if (isInitializing || trackerInstance) {
        console.debug('🔄 Tracker already initializing or exists:', {
            isInitializing,
            hasInstance: !!trackerInstance,
            isStarted
        });
        return initializationPromise;
    }

    isInitializing = true;
    initializationPromise = new Promise((resolve) => {
        try {
            // Before creating new instance, ensure cleanup of any existing one
            if (trackerInstance) {
                trackerInstance.stop();
                trackerInstance = null;
            }

            trackerInstance = new Tracker({
                projectKey: frontendConfig.openreplay.PROJECT_KEY,
                ingestPoint: getIngestPoint(),
                __DISABLE_SECURE_MODE: true,
                resourceBaseHref: getResourceBaseHref(),
                disableStringDict: true,
                verbose: true,
                network: {
                    failuresOnly: false,
                    ignoreHeaders: [
                        'traceparent',
                        'tracestate',
                        'elastic-apm-traceparent', 
                        'Cookie', 
                        'Set-Cookie', 
                        'Authorization'
                    ],
                    capturePayload: true,
                    captureAPM: false,
                    sessionTokenKey: "x-openreplay-session-id",
                    console: {
                        enabled: true,
                        levels: ['log', 'info', 'warn', 'error']
                    }
                },
                resourceUploadLimits: {
                    maxCssResourceSize: 2 * 1024 * 1024,
                    maxOtherResourceSize: 2 * 1024 * 1024
                },
                captureResourceMetrics: true,
                defaultInputMode: 0,
                obscureTextEmails: false,
                obscureTextNumbers: false,
                consoleThrottling: 60,
                connAttemptCount: 20,
                onStart: () => {
                    console.log('OpenReplay session started:', trackerInstance?.__sessionID);                }
            });

            // Disable APM integration for development
            if (import.meta.env.DEV) {
                setupAPMIntegration(trackerInstance);
            }

            // Update Assist plugin configuration with more robust options
            trackerInstance.use(trackerAssist({
                callConfirm: "Would you like to start a support call?",
                controlConfirm: "Would you like to allow support to control your screen?",
                onCallStart: () => {
                    console.log("🎥 Support call started");
                    toast.success("Support call started", {
                        description: "You are now connected to a support session",
                        duration: 5000
                    });
                    return () => {
                        console.log("📞 Support call ended");
                        toast.info("Support call ended");
                    };
                },
                onRemoteControlStart: () => {
                    console.log("🖱️ Remote control started");
                    toast.warning("Remote control active", {
                        description: "Support agent now has control of your screen",
                        duration: 5000
                    });
                    return () => {
                        console.log("🔒 Remote control ended");
                        toast.info("Remote control ended");
                    };
                },
                onAgentConnect: (agentInfo: any = {}) => {
                    const { email = '', name = '' } = agentInfo;
                    console.log("👋 Agent connected:", { email, name });
                    toast.success(`Support agent ${name} connected`, {
                        duration: 5000
                    });
                    return () => {
                        toast.info("Support agent disconnected");
                    };
                }
            }));

            trackerInstance.start()
                .then(() => {
                    isStarted = true;
                    console.debug('✅ Tracker started successfully:', {
                        sessionId: trackerInstance?.__sessionID,
                        timestamp: new Date().toISOString()
                    });
                    resolve(trackerInstance);
                })
                .catch((error) => {
                    console.error('❌ Failed to start tracker:', error);
                    isStarted = false;
                    trackerInstance = null;
                    resolve(null);
                });

        } catch (error) {
            console.error('Failed to initialize tracker:', error);
            isStarted = false;
            trackerInstance = null;
            resolve(null);
        } finally {
            isInitializing = false;
        }
    });

    return initializationPromise;
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
    console.log('Tracker configuration:', {
        projectKey: frontendConfig.openreplay.PROJECT_KEY,
        ingestPoint: getIngestPoint()
    });
    
    // Add storage access debug info
    debugStorageAccess();
    
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
        
        // Set the user ID
        tracker.setUserID(userId);

        // Set metadata if provided
        if (metadata) {
            Object.entries(metadata).forEach(([key, value]) => {
                if (value) {
                    tracker.setMetadata(key, String(value));
                }
            });
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
    
    console.warn('⏱ Tracker initialization timeout');
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
        console.warn('⚠ Feature flag check error:', {
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

export function debugElasticIntegration() {
    const tracker = getTracker();
    if (!tracker) {
        console.warn("⚠️ Tracker not available for Elastic debug");
        return;
    }

    console.group('🔍 Elastic APM Integration Status');
    try {
        // Create a new test transaction
        const testTransaction = apm?.startTransaction('debug-test', 'test');
        const currentTransaction = apm?.getCurrentTransaction();
        
        // Create a span for getting the span ID
        const span = testTransaction?.startSpan('debug-operation');

        const contextValues = {
            traceId: testTransaction?.traceId,
            transactionId: testTransaction?.id,
            spanId: span?.id, 
            hasAPM: !!apm,
            hasTransaction: !!testTransaction,
            currentTransaction: currentTransaction?.id,
            testTransactionId: testTransaction?.id,
            currentTraceId: currentTransaction?.traceId,
            testTraceId: testTransaction?.traceId
        };

        console.log('APM Transaction Details:', contextValues);
        
        // Clean up
        span?.end();
        testTransaction?.end();
    } catch (error) {
        console.error('Failed to debug APM:', error);
    } finally {
        console.groupEnd();
    }
}

// Add a function to check and potentially restart the tracker
export async function ensureTrackerActive() {
    const tracker = getTracker();
    if (!tracker || !isStarted) {
        console.debug('🔄 Restarting inactive tracker');
        cleanupTracker();
        return initTracker();
    }
    return tracker;
}

// Update cleanup to be more thorough
export function cleanupTracker() {
    if (trackerInstance) {
        try {
            trackerInstance.stop();
        } catch (error) {
            console.warn('Error stopping tracker:', error);
        }
    }
    
    if (browser) {
        localStorage.removeItem(TRACKER_STATE_KEY);
        sessionStorage.removeItem(TRACKER_SESSION_KEY);
    }
    
    trackerInstance = null;
    isStarted = false;
    isInitializing = false;
    initializationPromise = null;
    console.debug('🧹 Tracker cleanup completed');
}

// Simplified status check
export function isTrackerReady() {
    return trackerInstance !== null && isStarted;
}

// Update the setTrackerUser function to handle more metadata
export function setTrackerUser(username: string, metadata?: Record<string, any>) {
    const tracker = getTracker();
    if (!tracker || !username) {
        console.warn("⚠️ Cannot set user: tracker not initialized or username empty");
        return;
    }

    try {
        tracker.setUserID(username);
        console.log("👤 User ID set for tracker:", username);

        // Set additional metadata if provided
        if (metadata) {
            Object.entries(metadata).forEach(([key, value]) => {
                if (value) {
                    tracker.setMetadata(key, String(value));
                }
            });
        }
    } catch (error) {
        console.error("❌ Failed to set user ID:", error);
    }
}

// Add this debug function
export function debugAssetAccess() {
    const tracker = getTracker();
    if (!tracker) {
        console.warn("⚠️ Tracker not initialized");
        return;
    }

    console.group('🔍 OpenReplay Asset Access Debug');
    try {
        // @ts-ignore - accessing internal property
        const sessionID = tracker.__sessionID;

        // Log relevant info
        console.log('Session ID:', sessionID);
        console.log('Resource Base URL:', getResourceBaseHref());

        // Log all stylesheets
        const styles = document.styleSheets;
        console.log('Active Stylesheets:', Array.from(styles).map(sheet => ({
            href: sheet.href,
            rules: sheet.cssRules?.length,
            disabled: sheet.disabled
        })));

        // Log asset loading status
        console.log('Asset Loading Status:', {
            cssLoaded: document.styleSheets.length > 0,
            baseUrl: window.location.origin,
            pathname: window.location.pathname
        });
    } catch (error) {
        console.error('Debug Error:', error);
    }
    console.groupEnd();
}

export function debugResourceLoading() {
    const tracker = getTracker();
    if (!tracker) {
        console.warn("⚠️ Cannot debug resources: tracker not initialized");
        return;
    }

    console.group('🔍 OpenReplay Resource Loading Debug');
    try {
        // Check all stylesheets
        const styles = document.styleSheets;
        console.log('Stylesheet Count:', styles.length);

        Array.from(styles).forEach((sheet, index) => {
            console.log(`Stylesheet ${index}:`, {
                href: sheet.href,
                disabled: sheet.disabled,
                media: sheet.media.mediaText,
                rules: sheet.cssRules?.length
            });
        });

        // Check if base href is correct
        console.log('Base HREF:', document.baseURI);
        console.log('Resource Base HREF:', getResourceBaseHref());

        // Log performance metrics
        const perfEntries = performance.getEntriesByType('resource');
        console.log('Resource Performance:', perfEntries.map(entry => ({
            name: entry.name,
            duration: entry.duration,
            type: entry.initiatorType
        })));
    } catch (error) {
        console.error('Debug Error:', error);
    }
    console.groupEnd();
}

// Update the APM integration setup
export function setupAPMIntegration(tracker: Tracker) {
    if (!apm || import.meta.env.DEV) return;  // Skip in development

    tracker.setAPMIntegration?.({
        captureTracing: false,
        propagateTraceContext: false
    });
}

// Add a new function to handle proper initialization sequence
export async function initTrackerWithUser(user: any) {
    // First ensure tracker is initialized
    const tracker = await initTracker();
    
    // Then identify user
    if (tracker && user?.username) {
        // Set user ID
        tracker.setUserID(user.username);
        
        // Set additional metadata
        if (user.name) {
            tracker.setMetadata('name', user.name);
        }
        if (user.email || user.username) {
            tracker.setMetadata('email', user.email || user.username);
        }
        
        // Add the automatic identification in onStart back
        tracker.onStart(() => {
            const currentUser = get(userAccount);
            if (currentUser?.username) {
                tracker.setUserID(currentUser.username);
                if (currentUser.name) {
                    tracker.setMetadata('name', currentUser.name);
                }
                tracker.setMetadata('email', currentUser.username);
            }
        });
        
        console.log('👤 User identified in tracker:', {
            username: user.username,
            sessionId: tracker.getSessionID(),
            timestamp: new Date().toISOString()
        });
    }
    
    return tracker;
}
