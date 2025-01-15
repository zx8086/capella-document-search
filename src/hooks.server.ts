import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    if (event.request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': [
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
                    'cache-control',
                    'X-Openreplay-Batch'
                ].join(', '),
                'Access-Control-Expose-Headers': 'Content-Length',
                'Access-Control-Max-Age': '86400',
                'Access-Control-Allow-Credentials': 'true'
            }
        });
    }

    const response = await resolve(event);
    
    const csp = `
        default-src 'self';
        connect-src 'self' 
            https://*.openreplay.com 
            https://api.openreplay.com 
            wss://*.openreplay.com
            https://*.prd.shared-services.eu.pvh.cloud 
            wss://*.prd.shared-services.eu.pvh.cloud
            https://*.microsoftonline.com 
            https://*.graph.microsoft.com
            https://*.pinecone.io
            https://*.svc.pinecone.io
            https://*.shared-services.eu.pvh.cloud
            https://*.cloudfront.net
            https://*.aws.cloud.es.io
            https://*.aws.elastic-cloud.com
            https://*.cloud.couchbase.com
            https://*.siobytes.com
            https://eu-b2b.apm.eu-central-1.aws.cloud.es.io
            https://api.openai.com
            ${import.meta.env.DEV ? 'ws://localhost:* http://localhost:*' : ''};
        script-src 'self' 'unsafe-inline' 'unsafe-eval'
            https://*.openreplay.com
            https://static.openreplay.com
            https://vjs.zencdn.net 
            https://*.siobytes.com
            https://*.prd.shared-services.eu.pvh.cloud
            ${import.meta.env.DEV ? 'http://localhost:* ws://localhost:*' : ''};
        style-src 'self' 'unsafe-inline' 
            https://vjs.zencdn.net;
        img-src 'self' data: blob: https: 
            https://*.graph.microsoft.com
            https://*.prd.shared-services.eu.pvh.cloud;
        media-src 'self' blob: 
            https://*.openreplay.com 
            https://static.openreplay.com 
            https://*.cloudfront.net;
        worker-src 'self' blob: 
            https://*.prd.shared-services.eu.pvh.cloud
            https://*.openreplay.com;
        frame-src 'self' 
            https://*.microsoftonline.com;
        form-action 'self' 
            https://*.microsoftonline.com;
        font-src 'self' data:;
        child-src 'self' blob:;
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
        'cache-control',
        'X-Openreplay-Batch'
    ].join(', '));
    
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Max-Age', '86400');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Expose-Headers', 'Content-Length');

    return response;
}; 