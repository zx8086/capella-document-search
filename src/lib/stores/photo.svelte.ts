// src/lib/stores/photo.svelte.ts

import { Client, ResponseType } from "@microsoft/microsoft-graph-client";
import { browser } from "$app/environment";

const DEFAULT_AVATAR = "/default-avatar.png";
const PHOTO_CACHE_KEY = "user_photo_cache";
const PHOTO_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface PhotoCache {
	url: string;
	timestamp: number;
	noPhoto?: boolean;
}

function createPhotoStore() {
	let photoUrl = $state<string>(DEFAULT_AVATAR);
	let isLoading = $state(false);

	// Initialize from cache if available
	if (browser) {
		const cached = localStorage.getItem(PHOTO_CACHE_KEY);
		if (cached) {
			try {
				const { url, timestamp }: PhotoCache = JSON.parse(cached);
				if (Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
					photoUrl = url;
				} else {
					localStorage.removeItem(PHOTO_CACHE_KEY);
				}
			} catch (error) {
				console.warn("Failed to parse photo cache:", error);
			}
		}
	}

	async function fetchPhoto(accessToken: string, _userId: string): Promise<string> {
		if (!browser) return DEFAULT_AVATAR;

		try {
			// Check cache first
			const cached = localStorage.getItem(PHOTO_CACHE_KEY);
			if (cached) {
				const { url, timestamp, noPhoto }: PhotoCache = JSON.parse(cached);
				// If cache exists but contains a blob URL, ignore it and refetch
				if (url.startsWith("blob:")) {
					localStorage.removeItem(PHOTO_CACHE_KEY);
				} else {
					// If user has no photo, don't try fetching again for 24 hours
					if (noPhoto && Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
						photoUrl = DEFAULT_AVATAR;
						return DEFAULT_AVATAR;
					}
					if (Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
						photoUrl = url;
						return url;
					}
				}
			}

			const graphClient = Client.init({
				authProvider: (done) => done(null, accessToken),
			});

			try {
				const photoResponse = await graphClient
					.api("/me/photos/96x96/$value")
					.responseType(ResponseType.ARRAYBUFFER)
					.get();

				if (photoResponse) {
					// Convert ArrayBuffer to base64 string
					const base64String = btoa(
						new Uint8Array(photoResponse).reduce(
							(data, byte) => data + String.fromCharCode(byte),
							""
						)
					);

					const newPhotoUrl = `data:image/jpeg;base64,${base64String}`;

					// Cache the photo URL
					const cacheData: PhotoCache = {
						url: newPhotoUrl,
						timestamp: Date.now(),
						noPhoto: false,
					};
					localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cacheData));

					photoUrl = newPhotoUrl;
					return newPhotoUrl;
				}
			} catch (error: unknown) {
				if ((error as { statusCode?: number }).statusCode === 404) {
					// Cache the no-photo state
					const cacheData: PhotoCache = {
						url: DEFAULT_AVATAR,
						timestamp: Date.now(),
						noPhoto: true,
					};
					localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cacheData));
				}
				throw error;
			}

			return DEFAULT_AVATAR;
		} catch (error) {
			console.warn("Failed to fetch user photo:", error);
			photoUrl = DEFAULT_AVATAR;
			return DEFAULT_AVATAR;
		}
	}

	return {
		get url() {
			return photoUrl;
		},

		get isLoading() {
			return isLoading;
		},

		async ensurePhoto(accessToken: string, userId: string): Promise<string> {
			// If already loading, return current
			if (isLoading) {
				return photoUrl;
			}

			// If we already have a non-default photo, use it
			if (photoUrl !== DEFAULT_AVATAR) {
				return photoUrl;
			}

			try {
				isLoading = true;
				const result = await fetchPhoto(accessToken, userId);
				return result;
			} finally {
				isLoading = false;
			}
		},

		async fetchPhoto(accessToken: string, userId: string): Promise<string> {
			return fetchPhoto(accessToken, userId);
		},

		cleanup() {
			if (browser) {
				localStorage.removeItem(PHOTO_CACHE_KEY);
				photoUrl = DEFAULT_AVATAR;
			}
		},
	};
}

export const photoStore = createPhotoStore();

// Backwards-compatible exports
export const userPhotoUrl = {
	get value() {
		return photoStore.url;
	},
};

export function ensureUserPhoto(accessToken: string, userId: string): Promise<string> {
	return photoStore.ensurePhoto(accessToken, userId);
}

export function cleanupPhotoCache(): void {
	photoStore.cleanup();
}
