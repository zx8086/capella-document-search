import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    
    // Add security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    const csp = `
        default-src 'self';
        connect-src 'self' 
            https://*.openreplay.com 
            wss://*.openreplay.com
            https://api.openreplay.com
            https://openreplay.prd.shared-services.eu.pvh.cloud
            ws://*.openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.prd.shared-services.eu.pvh.cloud
            https://login.microsoftonline.com 
            https://*.microsoftonline.com 
            https://graph.microsoft.com
            https://*.graph.microsoft.com
            https://api.openai.com
            https://*.pinecone.io
            https://*.svc.pinecone.io
            https://*.shared-services.eu.pvh.cloud
            https://*.cloudfront.net
            https://*.aws.cloud.es.io
            https://*.aws.elastic-cloud.com
            https://*.cloud.couchbase.com
            https://*.siobytes.com
            https://eu-b2b.apm.eu-central-1.aws.cloud.es.io
            ${import.meta.env.DEV ? 'ws://localhost:* http://localhost:*' : ''};
        script-src 'self' 'unsafe-inline' 'unsafe-eval'
            https://vjs.zencdn.net 
            https://api.openreplay.com
            https://static.openreplay.com
            https://openreplay.prd.shared-services.eu.pvh.cloud;
        style-src 'self' 'unsafe-inline' https://vjs.zencdn.net;
        img-src 'self' data: https: blob:;
        media-src 'self' blob: https://*.cloudfront.net;
        frame-src 'self' https://*.microsoftonline.com;
        form-action 'self' https://*.microsoftonline.com;
        font-src 'self' data:;
        worker-src 'self' blob:;
        frame-ancestors 'self';
        base-uri 'self';
        object-src 'none'
    `.replace(/\s+/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);
    return response;
}; 