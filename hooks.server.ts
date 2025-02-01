// hooks.server.ts

import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

// Define paths that should be public
const PUBLIC_PATHS = [
    '/login',
    '/_app',           // All SvelteKit app assets
    '/build',          // Built assets
    '/favicon.ico',    // Favicon
    '/static',         // Static assets
];

// Add specific asset extensions that should always be public
const PUBLIC_EXTENSIONS = ['.css', '.js', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.svg'];

// Add specific immutable paths
const IMMUTABLE_PATHS = [
    '/_app/immutable/',
    '/_app/version.json',
];

export const handle: Handle = async ({ event, resolve }) => {
    const pathname = event.url.pathname;
    
    // Check if path should be public
    const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));
    const hasPublicExtension = PUBLIC_EXTENSIONS.some(ext => pathname.endsWith(ext));
    const isImmutablePath = IMMUTABLE_PATHS.some(path => pathname.startsWith(path));
    
    // Allow access to public paths and assets
    if (isPublicPath || hasPublicExtension || isImmutablePath) {
        const response = await resolve(event);
        // Add cache headers for immutable content
        if (isImmutablePath) {
            response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
        return response;
    }

    // Authentication check for non-public paths
    const authCookie = event.cookies.get('auth');
    if (!authCookie) {
        throw redirect(307, '/login');
    }

    const response = await resolve(event);
    
    // Security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}; 