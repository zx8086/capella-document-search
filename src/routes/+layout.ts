import { auth } from '$lib/stores/authStore';
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ url }) => {
    if (!browser) return {};

    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => url.pathname.startsWith(path));
    
    try {
        if (url.searchParams.has('code') || url.searchParams.has('error')) {
            console.log('Handling auth redirect...');
            await auth.handleRedirectPromise();
            return {};
        }

        const isAuthed = await auth.initialize();
        
        if (!isPublicPath && !isAuthed) {
            throw redirect(307, '/login');
        }

        if (isPublicPath && isAuthed && url.pathname === '/login') {
            throw redirect(307, '/');
        }

        return {};
    } catch (error) {
        if (error instanceof redirect) throw error;
        console.error('Layout load error:', error);
        return {};
    }
};
