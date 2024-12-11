import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    
    // Add security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), private-state-token-redemption=(), private-state-token-issuance=(), browsing-topics=()');
    response.headers.set('Content-Security-Policy', `
        default-src 'self';
        connect-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com 
            https://graph.microsoft.com
            https://*.graph.microsoft.com
            ws://localhost:* 
            http://localhost:* 
            https://*.openreplay.com 
            wss://*.openreplay.com
            https://api.openai.com
            https://*.pinecone.io
            https://*.svc.pinecone.io
            https://*.shared-services.eu.pvh.cloud
            https://*.prd.shared-services.eu.pvh.cloud
            https://*.cloudfront.net
            https://*.aws.cloud.es.io
            https://*.aws.elastic-cloud.com
            https://*.cloud.couchbase.com
            https://*.siobytes.com
            https://eu-b2b.apm.eu-central-1.aws.cloud.es.io
            https://apm.siobytes.com
            https://openreplay.prd.shared-services.eu.pvh.cloud
            ws://*.openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.prd.shared-services.eu.pvh.cloud
            ${import.meta.env.DEV ? 'ws://localhost:*' : ''};
        script-src 'self' 'unsafe-inline' 'unsafe-eval'
            https://vjs.zencdn.net 
            https://apm.siobytes.com 
            https://api.openreplay.com
            https://static.openreplay.com
            https://openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.com;
        style-src 'self' 'unsafe-inline' https://vjs.zencdn.net;
        img-src 'self' data: https: blob:
            https://graph.microsoft.com
            https://*.graph.microsoft.com;
        media-src 'self' blob: 
            https://*.openreplay.com 
            https://static.openreplay.com 
            https://d2bgp0ri487o97.cloudfront.net;
        frame-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com;
        form-action 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com;
        font-src 'self' data:;
        worker-src 'self' blob:;
        frame-ancestors 'self';
        base-uri 'self';
        object-src 'none'
    `.replace(/\s+/g, ' ').trim());

    return response;
}; 