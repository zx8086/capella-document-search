import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);
    
    const csp = `
        default-src 'self';
        connect-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com 
            https://graph.microsoft.com
            https://*.graph.microsoft.com
            ws://localhost:* 
            http://localhost:* 
            https://*.openreplay.com 
            https://api.openreplay.com
            wss://*.openreplay.com
            https://openreplay.prd.shared-services.eu.pvh.cloud
            wss://openreplay.prd.shared-services.eu.pvh.cloud
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
            https://openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.prd.shared-services.eu.pvh.cloud
            ws://openreplay.prd.shared-services.eu.pvh.cloud
            https://*.openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.prd.shared-services.eu.pvh.cloud
            https://openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.prd.shared-services.eu.pvh.cloud
            ${import.meta.env.DEV ? 'ws://localhost:*' : ''};
        script-src 'self' 'unsafe-inline' 'unsafe-eval'
            https://vjs.zencdn.net 
            https://apm.siobytes.com 
            https://api.openreplay.com
            https://static.openreplay.com
            https://openreplay.prd.shared-services.eu.pvh.cloud;
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
        worker-src 'self' blob: 
            https://openreplay.prd.shared-services.eu.pvh.cloud 
            https://*.openreplay.com
            https://api.openreplay.com;
        frame-ancestors 'self';
        base-uri 'self';
        object-src 'none'
    `.replace(/\s+/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    response.headers.set('Access-Control-Allow-Headers', [
        'Content-Type',
        'Authorization',
        'traceparent',
        'tracestate',
        'elastic-apm-traceparent',
        'x-openreplay-session-id',
        'baggage',
        'sentry-trace',
        'x-requested-with',
        'content-encoding',
        'accept',
        'origin',
        'cache-control'
    ].join(', '));

    if (event.url.pathname.startsWith('/ingest')) {
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.headers.set('Access-Control-Max-Age', '86400');
    }

    return response;
}; 