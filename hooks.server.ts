// hooks.server.ts

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // Authentication logic
    const publicPaths = ['/login'];
    const isPublicPath = publicPaths.some(path => event.url.pathname.startsWith(path));

    if (!isPublicPath) {
        const authCookie = event.cookies.get('auth');
        if (!authCookie) {
            throw redirect(307, '/login');
        }
    }

    const response = await resolve(event);
    
    // Add security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}; 