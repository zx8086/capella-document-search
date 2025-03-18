// @ts-nocheck
/* src/routes/+layout.ts */

import { auth, isLoading } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { initDebugTools } from '$lib/utils/debugUtils';
import { featureFlags } from '$lib/stores/featureFlagStore';

// Note: Import directly from $houdini/runtime/client after generation
import { HoudiniClient } from '$houdini/runtime/client';
import clientConfig from '../client';

// Initialize client without setHoudiniClient
const client = new HoudiniClient(clientConfig);

export const load = async ({ url, fetch }: Parameters<LayoutLoad>[0]) => {
    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));

    try {
        // Initialize feature flags only in browser
        if (browser) {
            try {
                await featureFlags.initialize();
            } catch (error) {
                console.warn('Feature flags initialization failed:', error);
                // Don't block the app if feature flags fail
            }
        }

        // Initialize auth state
        await auth.initialize();
        const isUserAuthenticated = auth.checkAuth();

        // If we're on login page and already authenticated, redirect to home
        if (isPublicPath && isUserAuthenticated) {
            throw redirect(307, '/');
        }

        // If we're not on a public path and not authenticated, redirect to login
        if (!isPublicPath && !isUserAuthenticated) {
            throw redirect(307, '/login');
        }

        return {
            featureFlags: browser ? true : false // Indicate if feature flags are available
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes('redirect')) {
            throw error;
        }
        console.error('Layout load error:', error);
        isLoading.set(false);
        throw redirect(307, '/login');
    }
};
// Only initialize debug tools in browser and development
if (browser && import.meta.env.DEV) {
    initDebugTools();
}

export const ssr = false; // Disable SSR for this layout if needed
