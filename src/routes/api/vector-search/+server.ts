/* src/routes/api/vector-search/+server.ts */

import { json } from "@sveltejs/kit";
import { handleVectorSearch } from "$lib/services/couchbase-service";
import { err, log } from "$utils/unifiedLogger";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  log("[REQUEST] [Vector Search] Starting vector search request");

  try {
    const { vector } = await request.json();

    // Use the service to handle the search
    const results = await handleVectorSearch(vector);

    log(
      `[OK] [Vector Search] Search complete, found ${Array.isArray(results) ? results.length : "unknown count"} results`
    );
    return json({ success: true, results });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    err("[ERROR] [Vector Search] Failed:", error);
    return json({ success: false, error: errorMessage }, { status: 500 });
  }
};
