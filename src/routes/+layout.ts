import { auth } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    // List of public paths
    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));

    try {
        // Handle auth redirect
        if (url.searchParams.has('code') || url.searchParams.has('error')) {
            await auth.handleRedirectPromise();
            return {};
        }

        // Initialize auth state
        const isAuthed = await auth.initialize();
        
        if (!isPublicPath && !isAuthed) {
            throw redirect(307, '/login');
        }

        if (isPublicPath && isAuthed) {
            throw redirect(307, '/');
        }

        return {};
    } catch (error) {
        if (error instanceof redirect) {
            throw error;
        }
        console.error('Layout load error:', error);
        return {};
    }
}; 