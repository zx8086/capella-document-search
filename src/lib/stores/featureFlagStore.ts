/* src/lib/stores/featureFlagStore.ts */

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { checkFeatureFlag } from '$lib/featureFlags';

export interface FeatureFlagState {
    isInitialized: boolean;
    isLoading: boolean;
    error: string | null;
}

export interface FeatureFlags {
    [key: string]: boolean;
}

// Create the status store outside the main store
const flagsStatus: Writable<FeatureFlagState> = writable({
    isInitialized: false,
    isLoading: false,
    error: null
});

function createFeatureFlagStore() {
    const { subscribe, set, update } = writable<FeatureFlags>({});

    return {
        subscribe,
        initialize: async () => {
            if (!browser) return;
            
            flagsStatus.set({
                isInitialized: false,
                isLoading: true,
                error: null
            });
            
            try {
                // Define your feature flags here
                const flags = {
                    'build-information': await checkFeatureFlag('build-information'),
                    'chat-assistant': await checkFeatureFlag('chat-assistant'),
                    'debug-mode': await checkFeatureFlag('debug-mode')
                };
                
                set(flags);
                flagsStatus.set({
                    isInitialized: true,
                    isLoading: false,
                    error: null
                });
            } catch (error) {
                console.error('Feature flags initialization error:', error);
                flagsStatus.set({
                    isInitialized: false,
                    isLoading: false,
                    error: error instanceof Error ? error.message : 'Failed to initialize flags'
                });
            }
        },
        getFlag: async (flagName: string, defaultValue = false) => {
            const value = await checkFeatureFlag(flagName, defaultValue);
            update(flags => ({ ...flags, [flagName]: value }));
            return value;
        }
    };
}

// Create and export the store instance
export const featureFlags = createFeatureFlagStore();
export const featureFlagStore = featureFlags; // Alias for compatibility
export const getFlag = featureFlags.getFlag;
export { flagsStatus }; // Export the status store