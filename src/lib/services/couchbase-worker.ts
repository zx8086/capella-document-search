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
            
            log("🔄 [Worker] Processing vector search request");

            // Get or create connection
            const cluster = await getConnection();
            
            // Verify vector dimensions
            // if (!Array.isArray(data.vector) || data.vector.length !== 4096) {
            //     throw new Error(`Invalid vector dimensions. Expected 4096, got ${data.vector?.length}`);
            // }

            // Updated search query structure based on docs
            const searchQuery = {
                fields: ["*"],
                knn: [{
                    field: "vectors",
                    k: 5,
                    vector: data.vector
                }]
            };

            log("🔍 [Worker] Executing vector search");

            try {
                const result = await cluster.searchQuery(
                    indexName,
                    searchQuery,
                    {
                        timeout: 10000,
                        metrics: true
                    }
                );

                const rows = [];
                for await (const row of result.rows) {
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

            } catch (searchError) {
                // Specific error handling for search operations
                if (searchError.message.includes('timeout')) {
                    throw new Error('Search operation timed out');
                }
                if (searchError.message.includes('index not found')) {
                    throw new Error(`Search index ${indexName} not found`);
                }
                throw searchError;
            }

        } catch (error) {
            // Enhanced error handling with specific error types
            const errorResponse = {
                success: false,
                error: error.message,
                errorType: error.constructor.name,
                errorCode: error.code,
                retryable: isRetryableError(error)
            };

            err("❌ [Worker] Error:", errorResponse);
            parentPort.postMessage(errorResponse);

            // Connection error handling
            if (isConnectionError(error)) {
                cluster = null; // Reset connection
                setTimeout(async () => {
                    try {
                        await getConnection(); // Attempt reconnection
                    } catch (reconnectError) {
                        err("❌ [Worker] Reconnection failed:", reconnectError);
                    }
                }, RECONNECT_DELAY);
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