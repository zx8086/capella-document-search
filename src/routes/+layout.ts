import { auth } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    try {
        // Check if we're handling a redirect
        if (url.searchParams.has('code') || url.searchParams.has('error')) {
            await auth.handleRedirectPromise();
            return {};
        }

        // Initialize auth state
        const isAuthed = await auth.initialize();

        // Handle protected routes
        if (url.pathname === '/login') {
            if (isAuthed) {
                throw redirect(307, '/');
            }
        } else if (!isAuthed && !url.pathname.includes('login')) {
            throw redirect(307, '/login');
        }

        return {};
    } catch (error) {
        if (error instanceof redirect) {
            throw error; // Let SvelteKit handle the redirect
        }
        // Only log other types of errors
        if (!(error instanceof redirect)) {
            console.error('Layout load error:', error);
        }
        return {};
    }
}; 