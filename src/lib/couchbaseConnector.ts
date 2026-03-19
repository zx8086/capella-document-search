// src/lib/couchbaseConnector.ts

import {
  type Bucket,
  type Cluster,
  type Collection,
  type CouchbaseError,
  connect,
  type DocumentNotFoundError,
  type QueryMetaData,
  type QueryOptions,
  type QueryResult,
  type Scope,
  type StreamableRowPromise,
} from "couchbase";
import { err, log } from "$utils/unifiedLogger";
import { backendConfig } from "../backend-config";

interface QueryableCluster extends Cluster {
  query<TRow = any>(
    statement: string,
    options?: QueryOptions
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

let globalCluster: Cluster | null = null;
let globalPromise: Promise<Cluster> | null = null;

// Circuit breaker: after a connection failure, reject immediately for this
// cooldown period instead of attempting another 10s connection that will
// also fail. This prevents the agent from burning 10s per tool call when
// the cluster is unreachable.
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;
let lastFailureTime: number | null = null;
let lastFailureError: string | null = null;

function isCircuitOpen(): boolean {
  if (!lastFailureTime) return false;
  return Date.now() - lastFailureTime < CIRCUIT_BREAKER_COOLDOWN_MS;
}

async function initializeConnection() {
  // Circuit breaker: fail fast if we recently failed
  if (isCircuitOpen()) {
    const elapsed = Date.now() - (lastFailureTime as number);
    const remaining = Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 1000);
    throw new Error(
      `Couchbase connection unavailable (circuit breaker open, retry in ${remaining}s). Last error: ${lastFailureError}`
    );
  }

  if (!globalPromise) {
    log("[Init] [CouchbaseConnector] Initializing global connection");
    globalPromise = connect(backendConfig.capella.URL, {
      username: backendConfig.capella.USERNAME,
      password: backendConfig.capella.PASSWORD,
    })
      .then((cluster) => {
        globalCluster = cluster;
        // Clear circuit breaker on successful connection
        lastFailureTime = null;
        lastFailureError = null;
        log("[OK] [CouchbaseConnector] Global connection established");
        return cluster;
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        err("[ERROR] [CouchbaseConnector] Global connection failed:", error);
        // Trip the circuit breaker
        lastFailureTime = Date.now();
        lastFailureError = errorMessage;
        globalPromise = null;
        throw error;
      });
  }
  return globalPromise;
}

// Start connection immediately
initializeConnection().catch((initErr) => {
  console.error("Initial connection failed:", initErr);
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

/** Check if Couchbase is currently reachable without attempting a connection. */
export function isConnectionAvailable(): boolean {
  if (globalCluster) return true;
  if (globalPromise) return true;
  return !isCircuitOpen();
}

/** Get a human-readable connection status for diagnostics. */
export function getConnectionStatus(): {
  connected: boolean;
  circuitOpen: boolean;
  lastError: string | null;
} {
  return {
    connected: !!globalCluster,
    circuitOpen: isCircuitOpen(),
    lastError: lastFailureError,
  };
}

export async function closeConnection() {
  if (globalCluster) {
    await globalCluster.close();
    globalCluster = null;
  }
  globalPromise = null;
}
