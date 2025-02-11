/* src/lib/stores/featureFlagStore.ts */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { IFeatureFlag } from '@openreplay/tracker';
import { getTracker } from '$lib/context/tracker';
import { log } from '$utils/unifiedLogger';

// Constants
const FLAG_CACHE_KEY = 'feature_flags_cache';
const FLAG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const INITIALIZATION_TIMEOUT = 10000; // 10 seconds
const RETRY_DELAY = 2000; // 2 seconds
const MAX_RETRIES = 5;

// Types
interface FlagCache {
  flags: Record<string, boolean>;
  timestamp: number;
}

interface FlagData {
  value: boolean;
  lastChecked: number;
}

interface FeatureFlag {
    key: string;
    value: boolean;
    lastChecked: number;
}

interface FeatureFlagState {
    flags: Record<string, FeatureFlag>;
    isInitialized: boolean;
    isLoading: boolean;
    error: string | null;
}

// Create the store
function createFeatureFlagStore() {
    const { subscribe, set, update } = writable<FeatureFlagState>({
        flags: {},
        isInitialized: false,
        isLoading: false,
        error: null
    });

    let initializePromise: Promise<void> | null = null;

    async function initialize() {
        if (!browser) return;
        
        console.log('🚩 Initializing feature flags store...');
        if (initializePromise) {
            console.log('🚩 Store already initializing...');
            return initializePromise;
        }

        initializePromise = new Promise(async (resolve) => {
            set({
                flags: {},
                isInitialized: false,
                isLoading: true,
                error: null
            });

            try {
                let tracker = getTracker();
                if (!tracker) {
                    throw new Error('Tracker not initialized');
                }

                // Get initial flags
                const flags = tracker.getAllFeatureFlags() || [];
                console.log('🚩 Initial flags from OpenReplay:', flags);

                const flagsMap = flags.reduce((acc, flag) => {
                    if (!flag || !flag.key) return acc;
                    
                    // OpenReplay flag value can be either directly in .value or in .value.value
                    const flagValue = typeof flag.value === 'boolean' 
                        ? flag.value 
                        : flag.value?.value === true;
                    
                    console.log(`🚩 Processing flag ${flag.key}:`, { 
                        rawValue: flag.value,
                        processedValue: flagValue 
                    });
                    
                    return {
                        ...acc,
                        [flag.key]: {
                            key: flag.key,
                            value: flagValue,
                            lastChecked: Date.now()
                        }
                    };
                }, {});

                console.log('🚩 Processed flags map:', flagsMap);

                set({
                    flags: flagsMap,
                    isInitialized: true,
                    isLoading: false,
                    error: null
                });

                // Set up listener for flag changes
                tracker.onFlagsLoad((updatedFlags) => {
                    console.log('🚩 Flags updated from OpenReplay:', updatedFlags);
                    update(state => ({
                        ...state,
                        flags: updatedFlags.reduce((acc, flag) => {
                            if (!flag || !flag.key) return acc;
                            const flagValue = typeof flag.value === 'boolean'
                                ? flag.value
                                : flag.value?.value === true;
                            return {
                                ...acc,
                                [flag.key]: {
                                    key: flag.key,
                                    value: flagValue,
                                    lastChecked: Date.now()
                                }
                            };
                        }, {})
                    }));
                });

            } catch (error) {
                console.error('🚩 Failed to initialize feature flags:', error);
                set({
                    flags: {},
                    isInitialized: false,
                    isLoading: false,
                    error: error instanceof Error ? error.message : 'Failed to initialize flags'
                });
            }
            resolve();
        });

        return initializePromise;
    }

    function getFlag(key: string): boolean {
        const state = get({ subscribe });
        if (!state.isInitialized) return false;
        
        const flag = state.flags[key];
        console.log(`Getting flag ${key}:`, flag);
        return flag?.value ?? false;
    }

    return {
        subscribe,
        initialize,
        getFlag
    };
}

// Export the store instance and its methods
export const featureFlags = createFeatureFlagStore();
export const { getFlag } = featureFlags;

// Export derived store for status
export const flagsStatus = derived(featureFlags, $flags => ({
    isInitialized: $flags.isInitialized,
    isLoading: $flags.isLoading,
    error: $flags.error,
    count: Object.keys($flags.flags).length
}));

// Debug helper
function debugFlags() {
  console.group('🚩 Feature Flags Status');
  console.log('Initialized:', featureFlags.subscribe(state => state.isInitialized));
  console.log('Loading:', featureFlags.subscribe(state => state.isLoading));
  console.log('Error:', featureFlags.subscribe(state => state.error));
  console.log('Flags:', featureFlags.subscribe(state => state.flags));
  console.log('Last Updated:', new Date(flagsStatus.subscribe(state => state.lastUpdated)).toISOString());
  console.groupEnd();
}

// Export store interface
export const featureFlagsInterface = {
  initialize: featureFlags.initialize,
  getFlag: featureFlags.getFlag,
  status: flagsStatus,
  debug: debugFlags
};

// Export the hook for components to use
export function useFeatureFlags() {
    return {
        flags: featureFlags,
        getFlag
    };
} 