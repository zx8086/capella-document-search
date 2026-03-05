/* src/lib/context/tracker.ts */

import Tracker from "@openreplay/tracker";
import trackerAssist from "@openreplay/tracker-assist";
import { toast } from "svelte-sonner";
import { frontendConfig } from "$frontendConfig";
import { authStore } from "$lib/stores/auth.svelte";
import { debugStorageAccess } from "$lib/utils/storage";
import apm from "../../apm-config";

interface IFeatureFlag {
  key: string;
  is_persist: boolean;
  value: string | boolean;
  payload: string;
}

export const key = Symbol("openreplay tracker symbol");

let trackerInstance: Tracker | null = null;
let isInitializing = false;
let isStarted = false;
let flagsInitialized = false;
let flagsInitializationPromise: Promise<void> | null = null;
let initializationPromise: Promise<Tracker | null> | null = null;

const getIngestPoint = () => {
  // Make sure we're using the correct production endpoint
  return import.meta.env.DEV
    ? "https://api.openreplay.com/ingest"
    : "https://openreplay.prd.shared-services.eu.pvh.cloud/ingest";
};

const getResourceBaseHref = () => {
  return import.meta.env.DEV
    ? "http://localhost:5173"
    : "https://capella-document-search.prd.shared-services.eu.pvh.cloud";
};

export async function initTracker() {
  // Add check for existing session
  if (isInitializing || trackerInstance) {
    console.debug("[Tracker] Already initializing or exists:", {
      isInitializing,
      hasInstance: !!trackerInstance,
      isStarted,
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
        __debug__: import.meta.env.DEV ? 4 : 0,
        network: {
          failuresOnly: false,
          ignoreHeaders: [
            "traceparent",
            "tracestate",
            "elastic-apm-traceparent",
            "Cookie",
            "Set-Cookie",
            "Authorization",
          ],
          capturePayload: true,
          captureInIframes: true,
          sessionTokenHeader: "x-openreplay-session-id",
          tokenUrlMatcher: (url: string) => {
            // Only inject session header on same-origin API requests to avoid CORS issues
            try {
              const parsed = new URL(url, window.location.origin);
              return parsed.origin === window.location.origin;
            } catch {
              return false;
            }
          },
        },
        captureResourceTimings: true,
        capturePageLoadTimings: true,
        capturePageRenderTimings: true,
        defaultInputMode: 0,
        obscureTextEmails: false,
        obscureTextNumbers: false,
        consoleMethods: ["log", "info", "warn", "error"],
        consoleThrottling: 60,
        connAttemptCount: 20,
        onStart: () => {
          console.log("OpenReplay session started:", trackerInstance?.getSessionID());
        },
      });

      if (!import.meta.env.DEV) {
        setupAPMIntegration(trackerInstance);
      }

      // Update Assist plugin configuration with more robust options
      trackerInstance.use(
        trackerAssist({
          callConfirm: "Would you like to start a support call?",
          controlConfirm: "Would you like to allow support to control your screen?",
          onCallStart: () => {
            console.log("[Tracker] Support call started");
            toast.success("Support call started", {
              description: "You are now connected to a support session",
              duration: 5000,
            });
            return () => {
              console.log("[Tracker] Support call ended");
              toast.info("Support call ended");
            };
          },
          onRemoteControlStart: () => {
            console.log("[Tracker] Remote control started");
            toast.warning("Remote control active", {
              description: "Support agent now has control of your screen",
              duration: 5000,
            });
            return () => {
              console.log("[Tracker] Remote control ended");
              toast.info("Remote control ended");
            };
          },
          onAgentConnect: (agentInfo: any = {}) => {
            const { email = "", name = "" } = agentInfo;
            console.log("[Tracker] Agent connected:", { email, name });
            toast.success(`Support agent ${name} connected`, {
              duration: 5000,
            });
            return () => {
              toast.info("Support agent disconnected");
            };
          },
        })
      );

      trackerInstance
        .start()
        .then(() => {
          isStarted = true;
          console.debug("[OK] Tracker started successfully:", {
            sessionId: trackerInstance?.getSessionID(),
            timestamp: new Date().toISOString(),
          });
          resolve(trackerInstance);
        })
        .catch((error) => {
          console.error("[ERROR] Failed to start tracker:", error);
          isStarted = false;
          trackerInstance = null;
          resolve(null);
        });
    } catch (error) {
      console.error("Failed to initialize tracker:", error);
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
    console.warn("[Tracker] Not initialized or not started");
    return null;
  }
  return trackerInstance;
}

export function getSessionId(): string | null {
  if (!trackerInstance || !isStarted) return null;
  return trackerInstance.getSessionID() || null;
}

export function debugTrackerStatus() {
  console.group("[Tracker] OpenReplay Tracker Status");
  console.log("Tracker instance exists:", !!trackerInstance);
  console.log("Tracker started:", isStarted);
  console.log("Tracker configuration:", {
    projectKey: frontendConfig.openreplay.PROJECT_KEY,
    ingestPoint: getIngestPoint(),
  });

  // Add storage access debug info
  debugStorageAccess();

  console.groupEnd();
}

export async function identifyUser(userId: string, metadata?: Record<string, any>) {
  const tracker = getTracker();
  if (!tracker) {
    console.warn("[Tracker] Cannot identify user: tracker not initialized or not started");
    return;
  }

  try {
    console.log("[Tracker] Identifying user:", { userId, metadata });

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

    console.log("[OK] User identification complete");
  } catch (error) {
    console.error("[ERROR] Failed to identify user:", error);
    if (error instanceof Error) tracker.handleError(error, { context: "identifyUser", userId });
  }
}

export function trackEvent(eventName: string, metadata: Record<string, any> = {}) {
  const tracker = getTracker();
  if (!tracker) {
    console.warn("[Tracker] Cannot track event: tracker not initialized");
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
    console.log("[Stats] Event tracked:", { eventName, metadata: enrichedMetadata });
  } catch (error) {
    console.error("[ERROR] Failed to track event:", error);
    if (error instanceof Error) tracker.handleError(error, { context: "trackEvent", eventName });
  }
}

export async function waitForTracker(timeout = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const tracker = getTracker();
    if (tracker) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.warn("[Tracker] Initialization timeout");
  return false;
}

export async function initFeatureFlags(): Promise<void> {
  // If flags are already initialized, return
  if (flagsInitialized) {
    console.debug("[Tracker] Feature flags already initialized");
    return;
  }

  // If initialization is in progress, return the existing promise
  if (flagsInitializationPromise) {
    console.debug("[Tracker] Feature flags initialization in progress");
    return flagsInitializationPromise;
  }

  const tracker = getTracker();
  if (!tracker) {
    console.warn("[Tracker] Cannot initialize feature flags: No tracker instance");
    return;
  }

  flagsInitializationPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("[Tracker] Feature flags load timeout");
      flagsInitialized = true;
      resolve();
    }, 5000); // 5 second timeout

    tracker.onFlagsLoad((flags: IFeatureFlag[]) => {
      clearTimeout(timeout);
      console.debug("[Tracker] Feature Flags Loaded:", {
        flags: flags.map((f) => ({ key: f.key, enabled: f.value })),
        timestamp: new Date().toISOString(),
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
    console.debug("[Tracker] Feature flag check failed: No tracker instance", {
      key,
      timestamp: new Date().toISOString(),
    });
    return false;
  }

  try {
    // Ensure flags are initialized
    if (!flagsInitialized) {
      console.debug("[Tracker] Initializing feature flags...");
      await initFeatureFlags();
    }

    // Use the direct flag access method
    const flag = tracker.getFeatureFlag(key);
    const isEnabled = flag?.value === true;

    console.debug("[Tracker] Feature Flag Check:", {
      key,
      isEnabled,
      flag,
      trackerActive: true,
      timestamp: new Date().toISOString(),
    });

    return isEnabled;
  } catch (error) {
    console.warn("[Tracker] Feature flag check error:", {
      key,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

export function setupFeatureFlagListener(): void {
  const tracker = getTracker();
  if (!tracker) return;

  tracker.onFlagsLoad((flags: IFeatureFlag[]) => {
    console.debug("[Tracker] Feature Flags Loaded:", {
      flags: flags.map((f) => ({ key: f.key, enabled: f.value })),
      timestamp: new Date().toISOString(),
    });
  });
}

// Add a function to check and potentially restart the tracker
export async function ensureTrackerActive() {
  const tracker = getTracker();
  if (!tracker || !isStarted) {
    console.debug("[Tracker] Restarting inactive tracker");
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
      console.warn("Error stopping tracker:", error);
    }
  }

  trackerInstance = null;
  isStarted = false;
  isInitializing = false;
  initializationPromise = null;
  console.debug("[Tracker] Cleanup completed");
}

// Simplified status check
export function isTrackerReady() {
  return trackerInstance !== null && isStarted;
}

// Update the setTrackerUser function to handle more metadata
export function setTrackerUser(username: string, metadata?: Record<string, any>) {
  const tracker = getTracker();
  if (!tracker || !username) {
    console.warn("[Tracker] Cannot set user: tracker not initialized or username empty");
    return;
  }

  try {
    tracker.setUserID(username);
    console.log("[Tracker] User ID set for tracker:", username);

    // Set additional metadata if provided
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value) {
          tracker.setMetadata(key, String(value));
        }
      });
    }
  } catch (error) {
    console.error("[ERROR] Failed to set user ID:", error);
    if (error instanceof Error) tracker.handleError(error, { context: "setTrackerUser", username });
  }
}

// Add this debug function
export function debugAssetAccess() {
  const tracker = getTracker();
  if (!tracker) {
    console.warn("[Tracker] Not initialized");
    return;
  }

  console.group("[Tracker] OpenReplay Asset Access Debug");
  try {
    const sessionID = tracker.getSessionID();

    // Log relevant info
    console.log("Session ID:", sessionID);
    console.log("Resource Base URL:", getResourceBaseHref());

    // Log all stylesheets
    const styles = document.styleSheets;
    console.log(
      "Active Stylesheets:",
      Array.from(styles).map((sheet) => ({
        href: sheet.href,
        rules: sheet.cssRules?.length,
        disabled: sheet.disabled,
      }))
    );

    // Log asset loading status
    console.log("Asset Loading Status:", {
      cssLoaded: document.styleSheets.length > 0,
      baseUrl: window.location.origin,
      pathname: window.location.pathname,
    });
  } catch (error) {
    console.error("Debug Error:", error);
  }
  console.groupEnd();
}

function setupAPMIntegration(tracker: Tracker) {
  if (!apm) return;

  tracker.setAPMIntegration?.({
    captureTracing: false,
    propagateTraceContext: false,
  });
}

let onStartRegistered = false;

export async function initTrackerWithUser(user: any) {
  const tracker = await initTracker();

  if (tracker && user?.username) {
    tracker.setUserID(user.username);

    if (user.name) {
      tracker.setMetadata("name", user.name);
    }
    if (user.email || user.username) {
      tracker.setMetadata("email", user.email || user.username);
    }

    // Register onStart only once to avoid stacking callbacks
    if (!onStartRegistered) {
      onStartRegistered = true;
      tracker.onStart(() => {
        const currentUser = authStore.userAccount;
        if (currentUser?.username) {
          tracker.setUserID(currentUser.username);
          if (currentUser.name) {
            tracker.setMetadata("name", currentUser.name);
          }
          tracker.setMetadata("email", currentUser.username);
        }
      });
    }

    console.log("[Tracker] User identified in tracker:", {
      username: user.username,
      sessionId: tracker.getSessionID(),
      timestamp: new Date().toISOString(),
    });
  }

  return tracker;
}
