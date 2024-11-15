import { tracker } from '$lib/services/tracker';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/stores/authStore';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));
    
    try {
        if (url.pathname === '/login') {
            return {};
        }

        const success = await auth.handleRedirect();
        const isAuthenticated = await auth.isAuthenticated();

        if (!isAuthenticated) {
            throw redirect(307, '/login');
        }

        return {};
    } catch (error) {
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
