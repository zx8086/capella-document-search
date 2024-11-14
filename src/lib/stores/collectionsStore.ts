import { writable } from 'svelte/store';
import type { Collection } from '../models/collections';

function createCollectionsStore() {
    const { subscribe, set, update } = writable<Collection[]>([]);

    return {
        subscribe,
        fetchCollections: async () => {
            try {
                const response = await fetch('/api/collections');
                const data = await response.json();
                
                if (data.error) {
                    console.warn('Collections warning:', data.error);
                    return false;
                }
                
                if (Array.isArray(data.collections)) {
                    set(data.collections);
                    return true;
                }
                
                return false;
            } catch (error) {
                console.error('Collections store error:', error);
                return false;
            }
        },
        reset: () => set([])
    };
}

export const collections = createCollectionsStore(); 