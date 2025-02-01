import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const GET: RequestHandler = async () => {
    // Only enable in development
    if (!dev) {
        return new Response('Not Found', { status: 404 });
    }

    return json({
        paths: {
            app: '/_app',
            immutable: '/_app/immutable',
            static: '/static',
        },
        message: 'Use these paths to verify asset accessibility'
    });
}; 