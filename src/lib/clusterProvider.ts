/* src/lib/clusterProvider.ts */

import { log, err } from "$utils/unifiedLogger";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../src/backend-config";

export const getCluster = async () => {
    try {
        const cluster = await clusterConn();
        
        if (!cluster) {
            throw new Error("No cluster connection available");
        }

        const bucket = cluster.bucket(backendConfig.capella.BUCKET);
        const scope = bucket.scope(backendConfig.capella.SCOPE);
        const collection = scope.collection(backendConfig.capella.COLLECTION);

        return {
            cluster,
            bucket: (name: string) => cluster.bucket(name),
            scope: (bucket: string, name: string) =>
                cluster.bucket(bucket).scope(name),
            collection: (bucket: string, scope: string, name: string) =>
                cluster.bucket(bucket).scope(scope).collection(name),
            defaultBucket: bucket,
            defaultScope: scope,
            defaultCollection: collection,
            vectorIndex: backendConfig.capella.VECTOR_INDEX,
            errors: {
                DocumentNotFoundError: Error,
                CouchbaseError: Error,
            },
        };
    } catch (error) {
        err("❌ [ClusterProvider] Error getting cluster:", error);
        throw error;
    }
};
