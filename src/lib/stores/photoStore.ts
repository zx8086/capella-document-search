/* src/lib/stores/photoStore.ts */

import { writable, get } from 'svelte/store';
import { 
  Client,
  GraphError, 
  ResponseType 
} from '@microsoft/microsoft-graph-client';
import { browser } from '$app/environment';
import { getMsalInstance, photoRequest } from '$lib/config/authConfig';

const DEFAULT_AVATAR = '/default-avatar.png';
const PHOTO_CACHE_KEY = 'user_photo_cache';
const PHOTO_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface PhotoCache {
  url: string;
  timestamp: number;
  noPhoto?: boolean;
}

export const userPhotoUrl = writable<string>(DEFAULT_AVATAR);

// Initialize from cache if available
if (browser) {
  const cached = localStorage.getItem(PHOTO_CACHE_KEY);
  if (cached) {
    try {
      const { url, timestamp }: PhotoCache = JSON.parse(cached);
      if (Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
        userPhotoUrl.set(url);
      } else {
        localStorage.removeItem(PHOTO_CACHE_KEY);
      }
    } catch (error) {
      console.warn('Failed to parse photo cache:', error);
    }
  }
}

// Add a loading state to prevent multiple fetches
const isPhotoLoading = writable(false);

export async function ensureUserPhoto(accessToken: string, userId: string) {
  // If already loading, wait for current fetch
  if (get(isPhotoLoading)) {
    return get(userPhotoUrl);
  }

  // If we already have a non-default photo, use it
  const currentPhoto = get(userPhotoUrl);
  if (currentPhoto !== DEFAULT_AVATAR) {
    return currentPhoto;
  }

  try {
    isPhotoLoading.set(true);
    const photoUrl = await fetchUserPhoto(accessToken, userId);
    return photoUrl;
  } finally {
    isPhotoLoading.set(false);
  }
}

export async function fetchUserPhoto(accessToken: string, userId: string) {
  if (!browser) return DEFAULT_AVATAR;

  try {
    // Check cache first
    const cached = localStorage.getItem(PHOTO_CACHE_KEY);
    if (cached) {
      const { url, timestamp, noPhoto }: PhotoCache = JSON.parse(cached);
      // If user has no photo, don't try fetching again for 24 hours
      if (noPhoto && Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
        userPhotoUrl.set(DEFAULT_AVATAR);
        return DEFAULT_AVATAR;
      }
      if (Date.now() - timestamp < PHOTO_CACHE_EXPIRY) {
        userPhotoUrl.set(url);
        return url;
      }
    }

    const graphClient = Client.init({
      authProvider: done => done(null, accessToken)
    });

    try {
      const metadata = await graphClient
        .api('/me/photos/96x96')
        .get();

      if (!metadata) {
        // Cache the no-photo state
        const cacheData: PhotoCache = {
          url: DEFAULT_AVATAR,
          timestamp: Date.now(),
          noPhoto: true
        };
        localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cacheData));
        userPhotoUrl.set(DEFAULT_AVATAR);
        return DEFAULT_AVATAR;
      }

      const photoResponse = await graphClient
        .api('/me/photos/96x96/$value')
        .responseType(ResponseType.ARRAYBUFFER)
        .get();

      if (photoResponse) {
        const blob = new Blob([photoResponse], { 
          type: metadata['@odata.mediaContentType'] || 'image/jpeg' 
        });
        const photoUrl = URL.createObjectURL(blob);

        // Cache the photo URL
        const cacheData: PhotoCache = {
          url: photoUrl,
          timestamp: Date.now(),
          noPhoto: false
        };
        localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cacheData));
        
        userPhotoUrl.set(photoUrl);
        return photoUrl;
      }
    } catch (error) {
      if (error.statusCode === 404) {
        // Cache the no-photo state
        const cacheData: PhotoCache = {
          url: DEFAULT_AVATAR,
          timestamp: Date.now(),
          noPhoto: true
        };
        localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cacheData));
      }
      throw error;
    }
    
    return DEFAULT_AVATAR;
  } catch (error) {
    console.warn('Failed to fetch user photo:', error);
    userPhotoUrl.set(DEFAULT_AVATAR);
    return DEFAULT_AVATAR;
  }
}

// Add cleanup function
export function cleanupPhotoCache() {
  if (browser) {
    localStorage.removeItem(PHOTO_CACHE_KEY);
    userPhotoUrl.set(DEFAULT_AVATAR);
  }
} 