import { backendConfig } from "../../backend-config";
import { connect, Cluster, SearchQuery } from "couchbase";

async function testConnection() {
    console.log("🔄 Starting Couchbase connection test...");
    
    try {
        console.log("📋 Connection details:", {
            url: backendConfig.capella.URL,
            username: backendConfig.capella.USERNAME,
            bucket: backendConfig.capella.BUCKET,
            scope: backendConfig.capella.SCOPE,
            collection: backendConfig.capella.COLLECTION
        });

        // Attempt connection
        console.log("🔄 Connecting to cluster...");
        const cluster: Cluster = await connect(backendConfig.capella.URL, {
            username: backendConfig.capella.USERNAME,
            password: backendConfig.capella.PASSWORD,
        });

        // Test basic query
        console.log("🔄 Testing query...");
        const result = await cluster.query('SELECT "test" as test');
        console.log("✅ Query result:", result);

        // Test bucket access
        console.log("🔄 Testing bucket access...");
        const bucket = cluster.bucket(backendConfig.capella.BUCKET);
        const scope = bucket.scope(backendConfig.capella.SCOPE);
        const collection = scope.collection(backendConfig.capella.COLLECTION);

        // List available indexes
        console.log("🔄 Checking available search indexes...");
        const manager = cluster.searchIndexes();
        const indexes = await manager.getAllIndexes();
        console.log("📋 Available search indexes:", indexes.map(idx => ({
            name: idx.name,
            type: idx.type,
            params: idx.params
        })));

        // Test vector search
        console.log("🔄 Testing vector search...");
        const searchQuery = {
            fields: ["*"],
            knn: [{
                field: "vectors",
                k: 2,
                vector: new Array(4096).fill(0.1)
            }]
        };

        const searchResult = await cluster.searchQuery(
            "default._default.ragpdfindex",
            searchQuery as any,
            {
                timeout: 10000
            }
        );

        console.log("✅ Vector search result:", searchResult);

        console.log("✅ All connection tests passed!");
        
        // Clean up
        await cluster.close();
        
    } catch (error) {
        console.error("❌ Connection test failed:", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            details: error.details || 'No additional details'
        });
    }
}

// Run the test
testConnection().then(() => {
    console.log("🏁 Test completed");
    process.exit(0);
}).catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
}); 