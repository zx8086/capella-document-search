/* src/lib/api.ts */

const API_BASE_URL = "https://cloudapi.cloud.couchbase.com/v4";
const ORG_ID = "9d75c6a4-2ec3-4a6c-8574-b3842eeaa4b5";
const PROJECT_ID = "1c249d82-f799-4b08-a8c0-18f7088e5049";
const CLUSTER_ID = "2091944c-177f-450e-9266-9761679ebc73";
const BUCKET_ID = "ZGVmYXVsdA==";
const AUTH_TOKEN =
  "bWJ1YVdPdnFqb2dwNDlOZUJlaHVUS0ZoQTRCT05wSU86QTBzUVpGQkB0NFBJaWhsRWglNGMhanlSUyVObG8xMWdVNEkjJVkhcVAwcGgyVDRBWk5oaUo1ZlRhRjdJMlpORg==";

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
