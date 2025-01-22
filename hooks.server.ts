import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    // Handle preflight requests
    if (event.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, X-Openreplay-Batch',
                'Access-Control-Max-Age': '86400',
                'Access-Control-Allow-Credentials': 'false'
            }
        });
    }

    const response = await resolve(event);
    
    // Set CORS headers for all responses
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Encoding, X-Openreplay-Batch');
    response.headers.set('Access-Control-Allow-Credentials', 'false');

    // Official OpenReplay CSP configuration
    const csp = `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.openreplay.com;
        style-src 'self' 'unsafe-inline' https://static.openreplay.com;
        img-src 'self' data: blob: https://*.openreplay.com;
        font-src 'self' data:;
        connect-src 'self' 
            https://api.openreplay.com 
            https://*.openreplay.com 
            wss://*.openreplay.com
            https://capella-document-search.prd.shared-services.eu.pvh.cloud;
        frame-src 'self';
        worker-src 'self' blob:;
        child-src 'self' blob:;
        media-src 'self' blob:;
        base-uri 'self';
    `.replace(/\s+/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}; 