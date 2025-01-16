import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import crypto from 'crypto';

export const handle: Handle = async ({ event, resolve }) => {
    // Handle preflight requests first
    if (event.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
                    'x-openreplay-metadata',
                    'x-openreplay-session-token'
                ].join(', '),
                'Access-Control-Max-Age': '86400',
                'Access-Control-Expose-Headers': [
                    'traceparent',
                    'tracestate',
                    'elastic-apm-traceparent',
                    'x-openreplay-session-id',
                    'baggage',
                    'sentry-trace',
                    'x-openreplay-metadata',
                    'x-openreplay-session-token'
                ].join(', ')
            }
        });
    }

    const response = await resolve(event);
    
    // Set CORS headers for all responses
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
        'x-openreplay-metadata',
        'x-openreplay-session-token'
    ].join(', '));
    response.headers.set('Access-Control-Expose-Headers', [
        'traceparent',
        'tracestate',
        'elastic-apm-traceparent',
        'x-openreplay-session-id',
        'baggage',
        'sentry-trace',
        'x-openreplay-metadata',
        'x-openreplay-session-token'
    ].join(', '));

    // Include both development and production endpoints regardless of environment
    const openReplayEndpoints = [
        // Development endpoints
        'https://api.openreplay.com',
        'wss://api.openreplay.com',
        'https://*.openreplay.com',
        'wss://*.openreplay.com',
        // Production endpoints
        'https://openreplay.prd.shared-services.eu.pvh.cloud',
        'https://*.openreplay.prd.shared-services.eu.pvh.cloud',
        'wss://*.openreplay.prd.shared-services.eu.pvh.cloud',
        // Local development
        'http://localhost:*',
        'ws://localhost:*',
        'https://localhost:*',
        'wss://localhost:*'
    ];

    const connectSrcAdditions = openReplayEndpoints.join(' ');
    
    const csp = `
        default-src 'self';
        connect-src 'self' 
            https://login.microsoftonline.com 
            https://*.microsoftonline.com 
            https://graph.microsoft.com
            https://*.graph.microsoft.com
            ${connectSrcAdditions}
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
            https://api.openai.com;
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
            https://*.openreplay.com;
        script-src 'self' 'unsafe-inline' 'unsafe-eval'
            https://openreplay.prd.shared-services.eu.pvh.cloud
            https://*.openreplay.com;
        connect-src 'self' 
            https://openreplay.prd.shared-services.eu.pvh.cloud
            https://*.openreplay.com
            wss://openreplay.prd.shared-services.eu.pvh.cloud
            wss://*.openreplay.com
            ${connectSrcAdditions};
        frame-ancestors 'self';
        base-uri 'self';
        object-src 'none'
    `.replace(/\s+/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return response;
}; 