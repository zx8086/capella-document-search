import { auth, isLoading } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { initDebugTools } from '$lib/utils/debugUtils';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));

    try {
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

        return {};
    } catch (error) {
        if (error.status === 307) {
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
