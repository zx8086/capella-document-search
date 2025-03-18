/* src/lib/featureFlags.ts */

import { browser } from '$app/environment';
import { GrowthBook } from '@growthbook/growthbook';
import { writable } from 'svelte/store';
import { frontendConfig } from "$frontendConfig";
import { OpenFeature } from '@openfeature/web-sdk';
import { GrowthBookProvider } from './openfeature/GrowthBookProvider';

let client;
export let gb: GrowthBook;
let openFeatureClient;

const initializeFeatureFlags = async () => {
    if (!browser) return;

    try {
        // Create GrowthBook instance with required configuration
        gb = new GrowthBook({
            apiHost: frontendConfig.growthbook.apiHost,
            clientKey: frontendConfig.growthbook.clientKey,
            enableDevMode: import.meta.env.DEV,
            subscribeToChanges: true,
            trackingCallback: (experiment, result) => {
                console.log('Experiment tracked:', experiment.key, result);
            }
        });

        // Wait for features to load
        await gb.loadFeatures();

        // Initialize OpenFeature with our GrowthBook instance
        const provider = new GrowthBookProvider(gb);
        await OpenFeature.setProviderAndWait(provider);
        openFeatureClient = OpenFeature.getClient();

        // Create a client interface that matches our existing usage
        client = {
            getBooleanValue: async (key: string, defaultValue: boolean) => {
                // Use GrowthBook directly to maintain existing behavior
                return gb.isOn(key) ?? defaultValue;
            }
        };

        // Set up auto-refresh of features (every 10 seconds)
        if (browser) {
            setInterval(() => {
                gb.refreshFeatures();
                console.log('Features refreshed from GrowthBook');
            }, 10000);
        }

    } catch (error) {
        console.error('Feature flag initialization failed:', error);
        // Create a dummy client that returns defaults
        client = {
            getBooleanValue: async (_key: string, defaultValue: boolean) => defaultValue
        };
    }
};

// Initialize in browser
if (browser) {
    initializeFeatureFlags().catch(console.error);
}

export async function checkFeatureFlag(flagName: string, defaultValue: boolean = false): Promise<boolean> {
    if (!browser || !client) return defaultValue;
    
    try {
        // Continue using the existing client for now
        return await client.getBooleanValue(flagName, defaultValue);
        
        // TODO: Once OpenFeature is proven stable, switch to:
        // return await openFeatureClient.getBooleanValue(flagName, defaultValue);
    } catch (error) {
        console.warn(`Failed to check feature flag ${flagName}:`, error);
        return defaultValue;
    }
}

// Export OpenFeature client for future use
export const getOpenFeatureClient = () => openFeatureClient;

export { client };
export const featureUpdates = writable(0);