/* src/routes/api/vector-search/+server.ts */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleVectorSearch } from '$lib/services/couchbase-service';
import { log, err } from '$utils/unifiedLogger';

export const POST: RequestHandler = async ({ request }) => {
    log("🔄 [Vector Search] Starting vector search request");
    
    try {
        const { vector } = await request.json();
        
        // Use the service to handle the search
        const results = await handleVectorSearch(vector);
        
        log(`✅ [Vector Search] Search complete, found ${Array.isArray(results) ? results.length : 'unknown count'} results`);
        return json({ success: true, results });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        err('❌ [Vector Search] Failed:', error);
        return json({ success: false, error: errorMessage }, { status: 500 });
    }
}; 