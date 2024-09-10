/* src/stores/collectionsStore.ts */

import { writable } from "svelte/store";

export interface Collection {
  bucket: string;
  scope_name: string;
  collection_name: string;
  tooltip_content?: string | null;
}

function createCollectionsStore() {
  const { subscribe, set, update } = writable<Collection[]>([]);

  return {
    subscribe,
    set,
    update,
    fetchCollections: async () => {
      try {
        const response = await fetch("/api/collections");
        if (!response.ok) {
          throw new Error("Failed to fetch collections");
        }
        const collections: Collection[] = await response.json();
        set(collections);
      } catch (error) {
        console.error("Error fetching collections:", error);
      }
    },
  };
}

export const collections = createCollectionsStore();
