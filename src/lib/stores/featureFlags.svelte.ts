// src/lib/stores/featureFlags.svelte.ts

import { browser } from "$app/environment";
import { checkFeatureFlag } from "$lib/featureFlags";

export interface FeatureFlagState {
	isInitialized: boolean;
	isLoading: boolean;
	error: string | null;
}

export interface FeatureFlags {
	[key: string]: boolean;
}

function createFeatureFlagStore() {
	let flags = $state<FeatureFlags>({});
	let status = $state<FeatureFlagState>({
		isInitialized: false,
		isLoading: false,
		error: null,
	});

	return {
		get flags() {
			return flags;
		},

		get isInitialized() {
			return status.isInitialized;
		},

		get isLoading() {
			return status.isLoading;
		},

		get error() {
			return status.error;
		},

		async initialize() {
			if (!browser) return;

			status = {
				isInitialized: false,
				isLoading: true,
				error: null,
			};

			try {
				const newFlags = {
					"build-information": await checkFeatureFlag("build-information"),
					"chat-assistant": await checkFeatureFlag("chat-assistant"),
					"debug-mode": await checkFeatureFlag("debug-mode"),
				};

				flags = newFlags;
				status = {
					isInitialized: true,
					isLoading: false,
					error: null,
				};
			} catch (error) {
				console.error("Feature flags initialization error:", error);
				status = {
					isInitialized: false,
					isLoading: false,
					error: error instanceof Error ? error.message : "Failed to initialize flags",
				};
			}
		},

		async getFlag(flagName: string, defaultValue = false): Promise<boolean> {
			const value = await checkFeatureFlag(flagName, defaultValue);
			flags = { ...flags, [flagName]: value };
			return value;
		},

		// Synchronous getter that reads from cached flags
		getFlagSync(flagName: string, defaultValue = false): boolean {
			return flags[flagName] ?? defaultValue;
		},
	};
}

export const featureFlags = createFeatureFlagStore();
export const featureFlagStore = featureFlags;
export const getFlag = (flagName: string, defaultValue = false): boolean => {
	// Synchronous access to cached flag values
	return featureFlags.getFlagSync(flagName, defaultValue);
};
