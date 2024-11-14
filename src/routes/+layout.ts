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
        
        // If not authenticated, clear any cached MSAL accounts
        if (!isAuthed) {
            const instance = await getMsalInstance();
            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                accounts.forEach(account => {
                    instance.removeAccount(account);
                });
            }
        }

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
            throw error;
        }
        console.error('Layout load error:', error);
        return {};
    }
}; 