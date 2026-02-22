// @ts-nocheck
/* src/routes/+layout.server.ts */

import type { LayoutServerLoad } from './$types';

export const load = async ({ locals }: Parameters<LayoutServerLoad>[0]) => {
    return {
        nonce: locals.nonce
    };
}; 