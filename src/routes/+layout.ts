import { auth } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    // List of public paths
    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));
    
    console.log('Route accessed:', url.pathname);
    console.log('Is public path:', isPublicPath);

    try {
        // Skip auth checks if we're handling a redirect
        if (url.searchParams.has('code') || url.searchParams.has('error')) {
            console.log('Handling auth redirect...');
            await auth.handleRedirectPromise();
            return {};
        }

        // Initialize auth state
        const isAuthed = await auth.initialize();
        console.log('Authentication status:', isAuthed);

        // Only redirect to login if we're not already there
        if (!isPublicPath && !isAuthed) {
            console.log('Redirecting to login...');
            throw redirect(307, '/login');
        }

        // Only redirect to home if we're authenticated and trying to access login
        if (isPublicPath && isAuthed && url.pathname === '/login') {
            console.log('Redirecting to home...');
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
