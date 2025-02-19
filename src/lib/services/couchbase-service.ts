import { Worker } from "worker_threads";
import { log, err } from "$utils/unifiedLogger";

let worker: Worker | null = null;

async function getWorker() {
    if (!worker) {
        worker = new Worker(new URL('./couchbase-worker.ts', import.meta.url));
        log("✅ [CouchbaseService] Worker created");
    }
    return worker;
}

async function handleVectorSearch(vector: number[]) {
    log("🔄 [CouchbaseService] Starting vector search");
    const worker = await getWorker();

    return new Promise((resolve, reject) => {
        worker.once('message', (result) => {
            if (result.success) {
                resolve(result.results);
            } else {
                reject(new Error(result.error));
            }
        });

        worker.postMessage({ vector });
    });
}

export { handleVectorSearch }; 