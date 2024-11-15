import { tracker } from '$lib/services/tracker';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { auth, isLoading } from '$lib/stores/authStore';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    // Set loading state
    isLoading.set(true);

    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));
    
    try {
        if (url.pathname === '/login') {
            isLoading.set(false);
            return {};
        }

        // Handle auth redirect first
        await auth.handleRedirect();
        
        // Check authentication
        const isAuthenticated = await auth.isAuthenticated();
        
        if (!isAuthenticated) {
            throw redirect(307, '/login');
        }

        isLoading.set(false);
        return {};
    } catch (error) {
        isLoading.set(false);
        if (error.status === 307) {
            throw error;
        }
        console.error('Layout load error:', error);
        throw redirect(307, '/login');
    }

    if (browser) {
        await tracker.init();
        tracker.event('page_view', {
            path: url.pathname,
            search: url.search,
            title: document.title
        });
    }

    return {
        url: url.pathname,
    };
};
