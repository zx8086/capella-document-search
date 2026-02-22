// src/lib/stores/collections.svelte.ts

import type { Collection } from "../../models/collections";

interface CollectionsState {
	items: Collection[];
	isLoading: boolean;
	error: string | null;
}

function createCollectionsStore() {
	let state = $state<CollectionsState>({
		items: [],
		isLoading: false,
		error: null,
	});

	async function fetchCollections(): Promise<boolean> {
		state.isLoading = true;
		state.error = null;

		try {
			const checkResponse = await fetch("/api/collections");
			const existingData = await checkResponse.json();

			// Seed database if empty
			if (!existingData || existingData.length === 0) {
				console.log("[CollectionsStore] Database empty, seeding first");
				await fetch("/api/collections", { method: "POST" });
			}

			const response = await fetch("/api/collections");
			const data = await response.json();

			if (data.error) {
				console.warn("[CollectionsStore] Collections warning:", data.error);
				state.error = data.error;
				state.isLoading = false;
				return false;
			}

			const collections = Array.isArray(data.collections)
				? data.collections
				: Array.isArray(data)
					? data
					: [];

			state.items = collections;
			state.isLoading = false;

			console.log("[CollectionsStore] Store updated:", {
				count: collections.length,
				timestamp: new Date().toISOString(),
			});

			return true;
		} catch (error) {
			console.error("[CollectionsStore] Error fetching collections:", error);
			state.error = error instanceof Error ? error.message : "Failed to fetch collections";
			state.isLoading = false;
			return false;
		}
	}

	function set(collections: Collection[]) {
		state.items = collections;
		console.log("[CollectionsStore] Store updated:", {
			count: collections.length,
			timestamp: new Date().toISOString(),
		});
	}

	function reset() {
		state.items = [];
		state.error = null;
	}

	return {
		get items() {
			return state.items;
		},
		get isLoading() {
			return state.isLoading;
		},
		get error() {
			return state.error;
		},
		fetchCollections,
		set,
		reset,
	};
}

export const collections = createCollectionsStore();
