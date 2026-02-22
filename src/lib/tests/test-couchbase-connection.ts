/* src/lib/tests/test-couchbase-connection.ts */

import { type Cluster, connect } from "couchbase";
import { backendConfig } from "../../backend-config";

async function testConnection() {
  console.log("[INFO] Starting Couchbase connection test...");

  try {
    console.log("[CONFIG] Connection details:", {
      url: backendConfig.capella.URL,
      username: backendConfig.capella.USERNAME,
      bucket: backendConfig.capella.BUCKET,
      scope: backendConfig.capella.SCOPE,
      collection: backendConfig.capella.COLLECTION,
    });

    // Attempt connection
    console.log("[INFO] Connecting to cluster...");
    const cluster: Cluster = await connect(backendConfig.capella.URL, {
      username: backendConfig.capella.USERNAME,
      password: backendConfig.capella.PASSWORD,
    });

    // Test basic query
    console.log("[INFO] Testing query...");
    const result = await cluster.query('SELECT "test" as test');
    console.log("[OK] Query result:", result);

    // Test bucket access
    console.log("[INFO] Testing bucket access...");
    const bucket = cluster.bucket(backendConfig.capella.BUCKET);
    const scope = bucket.scope(backendConfig.capella.SCOPE);
    const _collection = scope.collection(backendConfig.capella.COLLECTION);

    // List available indexes
    console.log("[INFO] Checking available search indexes...");
    const manager = cluster.searchIndexes();
    const indexes = await manager.getAllIndexes();
    console.log(
      "[CONFIG] Available search indexes:",
      indexes.map((idx) => ({
        name: idx.name,
        type: idx.type,
        params: idx.params,
      }))
    );

    // Test vector search
    console.log("[INFO] Testing vector search...");
    const searchQuery = {
      fields: ["*"],
      knn: [
        {
          field: "vectors",
          k: 2,
          vector: new Array(4096).fill(0.1),
        },
      ],
    };

    const searchResult = await cluster.searchQuery(
      "default._default.ragpdfindex",
      searchQuery as any,
      {
        timeout: 10000,
      }
    );

    console.log("[OK] Vector search result:", searchResult);

    console.log("[OK] All connection tests passed!");

    // Clean up
    await cluster.close();
  } catch (error) {
    console.error("[ERROR] Connection test failed:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details || "No additional details",
    });
  }
}

// Run the test
testConnection()
  .then(() => {
    console.log("[DONE] Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[ERROR] Test failed:", error);
    process.exit(1);
  });
