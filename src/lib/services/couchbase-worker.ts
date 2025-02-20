import { backendConfig } from "../../backend-config";
import { connect } from "couchbase";
import { parentPort } from "worker_threads";
import { log, err } from "$utils/unifiedLogger";

// Add connection management at the top
let cluster: any = null;
let isConnecting = false;
const RECONNECT_DELAY = 5000;

async function getConnection() {
    if (cluster) return cluster;
    if (isConnecting) {
        // Wait for existing connection attempt
        while (isConnecting) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return cluster;
    }

    try {
        isConnecting = true;
        cluster = await connect(backendConfig.capella.URL, {
            username: backendConfig.capella.USERNAME,
            password: backendConfig.capella.PASSWORD,
        });
        return cluster;
    } catch (error) {
        err("❌ [Worker] Connection error:", error);
        throw error;
    } finally {
        isConnecting = false;
    }
}

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
            log("🔍 [Worker] Verifying vector dimensions:", {
                received: data.vector.length,
                expected: 4096
            });

            // if (data.vector.length !== 4096) {
            //     throw new Error(`Invalid vector dimensions. Expected 4096, got ${data.vector.length}`);
            // }

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
                searchQuery,
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
            parentPort.postMessage({ success: true, results: rows });
            await cluster.close();
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

// Helper functions for error handling
function isConnectionError(error: any): boolean {
    return error.message.includes('connection') || 
           error.message.includes('timeout') ||
           error.code === 'ECONNREFUSED';
}

function isRetryableError(error: any): boolean {
    return isConnectionError(error) || 
           error.message.includes('timeout') ||
           error.code === 'ETIMEDOUT';
}

// Cleanup on exit
process.on('exit', async () => {
    if (cluster) {
        await cluster.close();
    }
});