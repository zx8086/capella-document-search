/* src/tools/upsertDocumentById.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { createError } from "../lib/errors";
import { z } from "zod";

export default (server: McpServer, bucket: Bucket) => {
    server.tool(
        "upsert_document_by_id",
        "Create or update a document with a specific ID",
        {
            scope_name: z.string().describe("Name of the scope"),
            collection_name: z.string().describe("Name of the collection"),
            document_id: z.string().describe("ID of the document to create or update"),
            document_content: z.string().describe("JSON content of the document"),
        },
        async ({ scope_name, collection_name, document_id, document_content }) => {
            try {
                logger.info("Processing document upsert:", {
                    scope_name,
                    collection_name,
                    document_id,
                });

                if (!bucket) {
                    throw createError("DB_ERROR", "Bucket is not initialized");
                }

                let content;
                try {
                    content = JSON.parse(document_content);
                } catch (e) {
                    throw createError("VALIDATION_ERROR", "Invalid JSON content");
                }

                const collection = bucket.scope(scope_name).collection(collection_name);
                await collection.upsert(document_id, content);

                logger.info("Document upserted successfully", {
                    scope: scope_name,
                    collection: collection_name,
                    id: document_id,
                });

                return {
                    content: [
                        {
                            type: "text",
                            text: `Document ${document_id} successfully upserted in ${scope_name}/${collection_name}`,
                        },
                    ],
                };
            } catch (error) {
                logger.error("Error in upsert_document_by_id:", error);
                throw error;
            }
        },
    );
}; 