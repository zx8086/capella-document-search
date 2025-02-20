import { backendConfig } from "../../backend-config";
import { connect, SearchRequest, VectorSearch, VectorQuery } from 'couchbase';
import { parentPort } from "worker_threads";
import { log, err } from "$utils/unifiedLogger";

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
    parentPort.on("message", async (data: { vector: number[] }) => {
        try {
            // Log the input vector (first few and last few dimensions)
            log("📊 [Worker] Input vector sample:", {
                length: data.vector.length,
                first5: data.vector.slice(0, 5),
                last5: data.vector.slice(-5),
                min: Math.min(...data.vector),
                max: Math.max(...data.vector),
                avg: data.vector.reduce((a, b) => a + b, 0) / data.vector.length
            });

            log("🔄 [Worker] Starting Couchbase connection with details:", {
                url: backendConfig.capella.URL,
                username: backendConfig.capella.USERNAME,
                bucket: backendConfig.capella.BUCKET,
                scope: backendConfig.capella.SCOPE,
                collection: backendConfig.capella.COLLECTION,
                indexName: backendConfig.capella.VECTOR_INDEX
            });

            const cluster = await getConnection();
            log("✅ [Worker] Connected to Couchbase");

            // Verify vector dimensions
            log("🔍 [Worker] Verifying vector dimensions:", {
                received: data.vector.length,
                expected: 4096
            });

            // Create vector search request
            const request = SearchRequest.create(
                VectorSearch.fromVectorQuery(
                    VectorQuery.create('vectors', data.vector)
                        .numCandidates(5)
                )
            );

            log("🔍 [Worker] Executing vector search with query:", {
                indexName: backendConfig.capella.VECTOR_INDEX,
                vectorField: 'vectors',
                numCandidates: 5,
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
                backendConfig.capella.VECTOR_INDEX,
                request,
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
            if (parentPort) {
                parentPort.postMessage({ success: true, results: rows });
            }
            
        } catch (error: any) { // Type the error
            err("❌ [Worker] Error:", {
                message: error?.message,
                code: error?.code,
                stack: error?.stack,
                type: error?.constructor?.name
            });
            if (parentPort) {
                parentPort.postMessage({ success: false, error: error?.message });
            }
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