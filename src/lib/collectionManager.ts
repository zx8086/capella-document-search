/* src/lib/collectionManager.ts */

import { log, err } from "$utils/unifiedLogger";
import { collections } from "../stores/collectionsStore";
import type { Collection } from "../models";

export async function seedCollections() {
  log("function seedCollections called from collectionManager");
  try {
    log("POST: /api/collections");
    const response = await fetch("/api/collections", { method: "POST" });
    const result = await response.json();
    if (result.success) {
      await collections.fetchCollections();
    }

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
  console.log("getCollections function called from collectionManager");
  try {
    console.log("Fetching collections from /api/collections");
    const response = await fetch("/api/collections");
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`,
      );
      throw new Error(
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`,
      );
    }
    const collections = await response.json();
    console.log("Fetched collections:", collections);
    return collections;
  } catch (error) {
    console.error("Error fetching collections:", error);
    throw error;
  }
}
