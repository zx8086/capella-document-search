/* src/lib/api.ts */

import { backendConfig } from "$backendConfig";
import { err, log } from "$utils/unifiedLogger";

const API_BASE_URL = backendConfig.capella.API_BASE_URL;
const ORG_ID = backendConfig.capella.ORG_ID;
const PROJECT_ID = backendConfig.capella.PROJECT_ID;
const CLUSTER_ID = backendConfig.capella.CLUSTER_ID;
const BUCKET_ID = backendConfig.capella.BUCKET_ID;
const AUTH_TOKEN = backendConfig.capella.AUTH_TOKEN;

log("Environment Variables loaded for Capella API", {
  API_BASE_URL,
  ORG_ID,
  PROJECT_ID,
  CLUSTER_ID,
  BUCKET_ID,
  AUTH_TOKEN_STATUS: AUTH_TOKEN ? "Set" : "Not set",
});

const headers = new Headers({
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/json",
});

interface Collection {
  maxTTL: number;
  name: string;
}

interface Scope {
  collections: Collection[];
  name: string;
}

interface ApiResponse {
  scopes: Scope[];
}

interface BucketScopeCollection {
  bucket: string;
  scope: string;
  collection: string;
}

const TIMEOUT_MS = 30000; // 30 seconds timeout

async function _fetchWithAuth<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL.split('"')[0].trim()}${endpoint}`;
  log(`Fetching data from: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await Promise.race([
      fetch(url, {
        headers,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS)
      ),
    ]);
    if (!response.ok) {
      const errorBody = await response.text();
      err(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    log(`Successfully fetched data from: ${url}`);
    return data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getAllScopes(): Promise<BucketScopeCollection[]> {
  const url = `${API_BASE_URL}/organizations/${ORG_ID}/projects/${PROJECT_ID}/clusters/${CLUSTER_ID}/buckets/${BUCKET_ID}/scopes`;

  try {
    log(`Attempting to fetch scopes from: ${url}`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      err(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    log(`Received data from Capella Management API Endpoint: ${data.scopes.length} scopes found`, {
      scopesCount: data.scopes.length,
    });

    if (!data || !data.scopes) {
      err("Unexpected API response structure:", data);
      throw new Error("Unexpected API response structure");
    }

    const allCollections: BucketScopeCollection[] = [];
    data.scopes.forEach((scope) => {
      scope.collections.forEach((collection) => {
        allCollections.push({
          bucket: "default",
          scope: scope.name,
          collection: collection.name,
        });
      });
    });

    return allCollections;
  } catch (error) {
    err("Error fetching scopes:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to fetch scopes: ${error.message}`);
    } else {
      throw new Error("An unknown error occurred while fetching scopes");
    }
  }
}
