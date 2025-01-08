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

function getCurrentApmTransaction() {
    try {
        return apm.apm?.getCurrentTransaction() || null;
    } catch (error) {
        console.warn('Failed to get current APM transaction:', error);
        return null;
    }
}

const getIngestPoint = () => {
    // Always use the direct URL from config
    return frontendConfig.openreplay.INGEST_POINT;
};

const getResourceBaseHref = () => {
    // Point directly to the base URL without the _app/immutable path
    // This lets SvelteKit handle the asset resolution
    return import.meta.env.DEV 
        ? 'http://localhost:5173'
        : 'https://capella-document-search.prd.shared-services.eu.pvh.cloud';
};

export async function initTracker() {
    if (trackerInstance && isStarted) {
        console.log("📝 Tracker already initialized and started");
        return trackerInstance;
    }

    if (initializationPromise) {
        console.log("⏳ Waiting for existing tracker initialization...");
        return initializationPromise;
    }

    try {
        isInitializing = true;
        initializationPromise = (async () => {
            console.log("🔍 Initializing OpenReplay tracker...");
            
            const tracker = new Tracker({
                projectKey: frontendConfig.openreplay.PROJECT_KEY,
                ingestPoint: getIngestPoint(),
                __DISABLE_SECURE_MODE: import.meta.env.DEV,
                resourceBaseHref: getResourceBaseHref(),
                network: {
                    enabled: true,
                    capturePayload: true,
                    failuresOnly: false,
                    ignoreHeaders: [
                        'Cookie', 
                        'Set-Cookie',
                        'traceparent',
                        'elastic-apm-traceparent'
                    ],
                    sessionTokenHeader: false,
                    onResourceLoad: (resource: any) => {
                        if (resource.initiatorType === 'stylesheet' || 
                            resource.initiatorType === 'script') {
                            console.debug('🎯 OpenReplay Resource Loaded:', {
                                url: resource.name,
                                type: resource.initiatorType,
                                duration: resource.duration,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                },
                verbose: true,
                onStart: () => {
                    console.log("✅ OpenReplay tracker started successfully");
                },
                onError: (error) => {
                    console.error("❌ OpenReplay tracker error:", error);
                }
            });

            await tracker.start();
            trackerInstance = tracker;
            isStarted = true;
            console.log("✅ Tracker started successfully");

            // Store the setUser callback for later use
            setUserCallback = (username: string) => {
                if (tracker) {
                    tracker.setUserID(username);
                    console.log("👤 User ID set for tracker:", username);
                }
            };

            return tracker;
        })();

        return await initializationPromise;
    } catch (error) {
        console.error('❌ Tracker initialization failed:', error);
        throw error;
    } finally {
        isInitializing = false;
        initializationPromise = null;
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
      ingestPoint: getIngestPoint(),
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

// Add cleanup function for logout
export function cleanupTracker() {
    if (browser) {
        localStorage.removeItem(TRACKER_STATE_KEY);
    }
    trackerInstance = null;
    isStarted = false;
    isInitializing = false;
    initializationPromise = null;
}

// Add helper to check tracker status
export function isTrackerReady() {
    return trackerInstance !== null && isStarted;
}

// Export a function to set the user that can be called from authStore
export function setTrackerUser(username: string) {
    if (setUserCallback) {
        setUserCallback(username);
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
