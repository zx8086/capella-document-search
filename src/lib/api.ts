/* src/lib/api.ts */

const API_BASE_URL = Bun.env.API_BASE_URL;
const ORG_ID = Bun.env.ORG_ID;
const PROJECT_ID = Bun.env.PROJECT_ID;
const CLUSTER_ID = Bun.env.CLUSTER_ID;
const BUCKET_ID = Bun.env.BUCKET_ID;
const AUTH_TOKEN = Bun.env.AUTH_TOKEN;

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

async function fetchWithAuth<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`Fetching data from: ${url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await Promise.race([
      fetch(url, {
        headers,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS),
      ),
    ]);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `HTTP error! status: ${response.status}, body: ${errorBody}`,
      );
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched data from: ${url}`, data);
    return data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getAllScopes(): Promise<BucketScopeCollection[]> {
  const endpoint = `/organizations/${ORG_ID}/projects/${PROJECT_ID}/clusters/${CLUSTER_ID}/buckets/${BUCKET_ID}/scopes`;
  try {
    const data: ApiResponse = await fetchWithAuth<ApiResponse>(endpoint);

    console.log("Getting Data from endpoint", data);

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
    console.error("Error fetching scopes:", error);
    throw error;
  }
}
