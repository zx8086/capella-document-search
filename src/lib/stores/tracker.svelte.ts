// src/lib/stores/tracker.svelte.ts

function createTrackerStore() {
	let sessionId = $state<string | null>(null);

	return {
		get sessionId() {
			return sessionId;
		},

		setSessionId(id: string | null) {
			sessionId = id;
		},
	};
}

export const trackerStore = createTrackerStore();
