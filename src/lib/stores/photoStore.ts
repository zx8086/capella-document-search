import { writable } from 'svelte/store';
import { 
  Client,
  GraphError, 
  ResponseType 
} from '@microsoft/microsoft-graph-client';
import { browser } from '$app/environment';
import { getMsalInstance, photoRequest } from '$lib/config/authConfig';

const DEFAULT_AVATAR = 'static/default-avatar.png';
export const userPhotoUrl = writable<string>(DEFAULT_AVATAR);

export async function fetchUserPhoto(userId: string) {
  if (!browser) return;

  try {
    console.group('📸 Photo Fetch Process');
    
    const instance = await getMsalInstance();
    const account = instance?.getAllAccounts()[0];
    
    const response = await instance?.acquireTokenSilent({
      scopes: photoRequest.scopes,
      account: account
    });

    if (!response?.accessToken) {
      throw new Error('No access token available');
    }

    const graphClient = Client.init({
      authProvider: async (done) => {
        done(null, response.accessToken);
      },
      defaultVersion: 'v1.0'
    });

    try {
      console.group('🔍 Photo Fetch Attempt');
      
      console.log('Checking photo metadata...');
      const metadata = await graphClient
        .api('/me/photo')
        .get();
      
      console.log('Photo metadata:', metadata);

      if (metadata) {
        console.log('Fetching photo binary...');
        const photoResponse = await graphClient
          .api('/me/photo/$value')
          .header('Content-Type', 'image/jpeg')
          .responseType(ResponseType.ARRAYBUFFER)
          .middlewareOptions([])
          .get();

        if (photoResponse) {
          const blob = new Blob([photoResponse], { type: 'image/jpeg' });
          const photoUrl = URL.createObjectURL(blob);
          
          const cleanup = () => {
            URL.revokeObjectURL(photoUrl);
            console.log('Photo URL revoked:', photoUrl);
          };

          userPhotoUrl.set(photoUrl);
          return {
            success: true,
            isDefault: false,
            cleanup
          };
        }
      }
    } catch (error) {
      if (error?.statusCode === 404) {
        console.group('📸 Photo Not Found Details');
        console.log('Status Code:', error.statusCode);
        
        let errorDetails;
        try {
          const errorText = error.body instanceof ArrayBuffer 
            ? new TextDecoder().decode(error.body)
            : typeof error.body === 'string' 
              ? error.body 
              : JSON.stringify(error.body);
          
          errorDetails = JSON.parse(errorText);
          
          console.log('Full Error Response:', {
            raw: errorText,
            parsed: errorDetails,
            code: errorDetails?.error?.code,
            message: errorDetails?.error?.message,
            innerError: errorDetails?.error?.innerError
          });
          
          const errorCode = errorDetails?.error?.code;
          const errorMessage = errorDetails?.error?.message;
          
          userPhotoUrl.set(DEFAULT_AVATAR);
          console.groupEnd();
          return { 
            success: true, 
            isDefault: true,
            reason: errorCode === 'ErrorNonExistentStorage' 
              ? 'No profile photo has been set up in Microsoft 365'
              : 'No photo found',
            errorCode,
            errorMessage,
            details: errorDetails?.error
          };
        } catch (parseError) {
          console.log('Error parsing response:', {
            parseError,
            originalError: error,
            body: error.body
          });
        }
        console.groupEnd();
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Error fetching photo:', {
      status: error?.statusCode,
      message: error?.message,
      body: error.body,
      raw: typeof error.body === 'string' 
        ? error.body 
        : error.body instanceof ArrayBuffer 
          ? new TextDecoder().decode(error.body)
          : JSON.stringify(error.body),
      requestId: error?.requestId,
      clientRequestId: error?.clientRequestId
    });
    console.groupEnd();
    userPhotoUrl.set(DEFAULT_AVATAR);
    return { 
      success: false, 
      isDefault: true,
      error: error?.message || 'Unknown error',
      details: error.body
    };
  }
} 