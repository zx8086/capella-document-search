import { writable } from 'svelte/store';

// Define or import DEFAULT_AVATAR
const DEFAULT_AVATAR = 'static/default-avatar.png';

export const userPhotoUrl = writable<string>(DEFAULT_AVATAR);

export async function fetchUserPhoto(userId: string) {
  if (!browser) return;

  try {
    const instance = await getMsalInstance();
    console.log('📦 MSAL Instance:', !!instance);
    
    const account = instance.getAllAccounts()[0];
    const tokenResponse = await instance.acquireTokenSilent({
      scopes: ["User.Read", "User.ReadBasic.All"],
      account: account
    });
    console.log('🎫 Token acquired:', !!tokenResponse.accessToken);

    // Try multiple endpoints in sequence
    const endpoints = [
      'https://graph.microsoft.com/v1.0/me/photos/48x48/$value',
      'https://graph.microsoft.com/v1.0/me/photo/$value',
      'https://graph.microsoft.com/beta/me/photo/$value',
      `https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`
    ];

    for (const endpoint of endpoints) {
      const timestamp = Date.now();
      const url = `${endpoint}?t=${timestamp}`;
      console.log('🔄 Trying endpoint:', url);

      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${tokenResponse.accessToken}`,
            'Accept': 'image/*',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'client-request-id': crypto.randomUUID()
          }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

        if (response.ok) {
          const blob = await response.blob();
          console.log('📸 Successfully fetched photo blob:', blob.size, 'bytes');
          userPhotoUrl.set(URL.createObjectURL(blob));
          return {
            success: true,
            isDefault: false
          };
        }

        const errorText = await response.text();
        console.log('❌ Endpoint failed:', {
          endpoint: url,
          status: response.status,
          error: errorText
        });

      } catch (error) {
        console.error('❌ Failed to fetch from', url, error);
      }
    }

    console.log('⚠️ All endpoints failed, returning default photo');
    userPhotoUrl.set(DEFAULT_AVATAR);
    return {
      success: true,
      isDefault: true
    };

  } catch (error) {
    console.error('🚫 Error retrieving user photo:', error);
    userPhotoUrl.set(DEFAULT_AVATAR);
    return {
      success: false,
      isDefault: true
    };
  }
} 