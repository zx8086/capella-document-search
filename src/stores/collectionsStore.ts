/* src/stores/collectionsStore.ts */

import { writable } from "svelte/store";
import type { Collection } from "../models";

function createCollectionsStore() {
  const { subscribe, set, update } = writable<Collection[]>([]);

  return {
    subscribe,
    set,
    update,
    fetchCollections: async () => {
      try {
        // First check if database is empty
        const checkResponse = await fetch("/api/collections");
        const existingData = await checkResponse.json();
        
        // If empty, seed the database first
        if (!existingData || existingData.length === 0) {
            console.log("Database empty, seeding first");
            await fetch("/api/collections", { method: "POST" });
        }
        
        // Then fetch the collections
        const response = await fetch("/api/collections");
        if (!response.ok) {
            throw new Error("Failed to fetch collections");
        }
        const collections = await response.json();
        set(collections);
      } catch (error) {
        console.error("Error fetching collections:", error);
      }
    },
  };
}

export const collections = createCollectionsStore();

// Add this to see store updates
collections.subscribe((value) => {
  console.log("🔄 Collections store updated:", { 
    count: value.length,
    timestamp: new Date().toISOString()
  });
});