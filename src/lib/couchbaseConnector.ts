/* src/lib/couchbaseConnector.ts */

import { backendConfig } from "../backend-config";
import { log, err } from "$utils/unifiedLogger";
import {
  Cluster,
  Bucket,
  Scope,
  Collection,
  connect,
  type QueryOptions,
  QueryResult,
  StreamableRowPromise,
  QueryMetaData,
  DocumentNotFoundError,
  CouchbaseError,
} from "couchbase";

interface QueryableCluster extends Cluster {
  query<TRow = any>(
    statement: string,
    options?: QueryOptions,
  ): StreamableRowPromise<QueryResult<TRow>, TRow, QueryMetaData>;
}

export interface capellaConn {
  cluster: QueryableCluster;
  bucket: (name: string) => Bucket;
  scope: (bucket: string, name: string) => Scope;
  collection: (bucket: string, scope: string, name: string) => Collection;
  defaultBucket: Bucket;
  defaultScope: Scope;
  defaultCollection: Collection;
  vectorIndex: string;
  errors: {
    DocumentNotFoundError: typeof DocumentNotFoundError;
    CouchbaseError: typeof CouchbaseError;
  };
}

// Move these to module scope
let globalCluster: Cluster | null = null;
let globalPromise: Promise<Cluster> | null = null;

// Initialize connection when module loads
async function initializeConnection() {
    if (!globalPromise) {
        log("🔄 [CouchbaseConnector] Initializing global connection");
        globalPromise = connect(backendConfig.capella.URL, {
            username: backendConfig.capella.USERNAME,
            password: backendConfig.capella.PASSWORD
        }).then(cluster => {
            globalCluster = cluster;
            log("✅ [CouchbaseConnector] Global connection established");
            return cluster;
        }).catch(error => {
            err("❌ [CouchbaseConnector] Global connection failed:", error);
            globalPromise = null;
            throw error;
        });
    }
    return globalPromise;
}

// Start connection immediately
initializeConnection().catch(err => {
    console.error("Initial connection failed:", err);
});

export async function clusterConn() {
    if (globalCluster) {
        return globalCluster;
    }
    
    if (globalPromise) {
        return globalPromise;
    }
    
    return initializeConnection();
}

export async function closeConnection() {
    if (globalCluster) {
        await globalCluster.close();
        globalCluster = null;
    }
    globalPromise = null;
}
