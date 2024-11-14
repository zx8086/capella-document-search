import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    
    // Add security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Content-Security-Policy', `
        default-src 'self';
        connect-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com 
            ws://localhost:* 
            http://localhost:* 
            https://*.shared-services.eu.pvh.cloud 
            https://*.prd.shared-services.eu.pvh.cloud 
            https://*.cloudfront.net 
            https://*.aws.cloud.es.io 
            https://*.aws.elastic-cloud.com 
            https://*.cloud.couchbase.com 
            https://*.openreplay.com 
            https://*.siobytes.com;
        script-src 'self' 'unsafe-inline' 'unsafe-eval' 
            https://vjs.zencdn.net 
            https://apm.siobytes.com 
            https://api.openreplay.com;
        style-src 'self' 'unsafe-inline' https://vjs.zencdn.net;
        img-src 'self' data: https: blob:;
        frame-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com;
        form-action 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com;
        font-src 'self' data:;
        media-src 'self' blob:;
        worker-src 'self' blob:;
        frame-ancestors 'self';
        base-uri 'self';
        object-src 'none'
    `.replace(/\s+/g, ' ').trim());

    return response;
}; 