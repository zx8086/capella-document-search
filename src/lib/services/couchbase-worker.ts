import { backendConfig } from "../../backend-config";
import { connect } from "couchbase";
import { parentPort } from "worker_threads";
import { log, err } from "$utils/unifiedLogger";

if (parentPort) {
    parentPort.on("message", async (data) => {
        try {
            const indexName = "default._default.ragpdfindex";
            
            log("🔄 [Worker] Starting Couchbase connection with details:", {
                url: backendConfig.capella.URL,
                username: backendConfig.capella.USERNAME,
                bucket: backendConfig.capella.BUCKET,
                scope: backendConfig.capella.SCOPE,
                collection: backendConfig.capella.COLLECTION,
                indexName
            });

            const cluster = await connect(backendConfig.capella.URL, {
                username: backendConfig.capella.USERNAME,
                password: backendConfig.capella.PASSWORD,
            });

            log("✅ [Worker] Connected to Couchbase");

            // Verify vector dimensions
            if (data.vector.length !== 4096) {
                throw new Error(`Invalid vector dimensions. Expected 4096, got ${data.vector.length}`);
            }

            const searchQuery = {
                fields: ["*"],
                knn: [{
                    field: "vectors",
                    k: 5,
                    vector: data.vector
                }]
            };

            log("🔍 [Worker] Executing vector search with query:", {
                indexName,
                queryFields: searchQuery.fields,
                vectorField: searchQuery.knn[0].field,
                vectorLength: data.vector.length
            });

            // List available indexes for debugging
            const manager = cluster.searchIndexes();
            const indexes = await manager.getAllIndexes();
            log("📋 [Worker] Available indexes:", indexes.map(idx => ({
                name: idx.name,
                type: idx.type
            })));

            const result = await cluster.searchQuery(
                indexName,
                searchQuery as any,
                { timeout: 10000 }
            );

            const rows = [];
            for await (const row of result.rows) {
                log("📄 [Worker] Processing row:", {
                    id: row.id,
                    score: row.score,
                    fields: Object.keys(row.fields || {})
                });
                rows.push({
                    id: row.id,
                    score: row.score,
                    text: row.fields?.content || row.fields?.text,
                    filename: row.fields?.filename || row.fields?.source,
                    metadata: row.fields
                });
            }

            log(`✅ [Worker] Search complete, found ${rows.length} results`);
            await cluster.close();
            parentPort.postMessage({ success: true, results: rows });
        } catch (error) {
            err("❌ [Worker] Error:", {
                message: error.message,
                code: error.code,
                stack: error.stack,
                type: error.constructor.name
            });
            parentPort.postMessage({ success: false, error: error.message });
        }
    });
}