/* src/lib/collectionManager.ts */

import { log, err } from "../utils/unifiedLogger";

interface Collection {
  bucket: string;
  scope: string;
  collection: string;
}

export async function seedCollections() {
  log("function seedCollections called");
  try {
    log("POST: /api/collections");
    const response = await fetch("/api/collections", { method: "POST" });
    const result = await response.json();

    if (!response.ok) {
      err(
        `Failed to seed collections. Status: ${response.status}, Error:`,
        result,
      );
      throw new Error(
        `Failed to seed collections. Status: ${response.status}, Error: ${result.message || JSON.stringify(result)}`,
      );
    }

    if (!result.success) {
      err("Seeding collections failed:", result.message);
      throw new Error(result.message);
    }

    log(`Collections seeded successfully. Count: ${result.count}`);
  } catch (error) {
    err("Error seeding collections:", error);
    throw error;
  }
}

export async function getCollections(): Promise<Collection[]> {
  log("function getCollections called");
  try {
    log("GET: /api/collections");
    const response = await fetch("/api/collections");
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`,
      );
    }
    const collections = await response.json();
    return collections;
  } catch (error) {
    err("Error fetching collections:", error);
    throw error;
  }
}
