/* src/lib/collectionManager.ts */

import { err, log } from "$utils/unifiedLogger";
import type { Collection } from "../models";

export async function seedCollections() {
  log("[Seed] Starting database seeding process");
  try {
    // First check if we already have data
    const checkResponse = await fetch("/api/collections");
    const existingData = await checkResponse.json();
    log(`[Stats] Current database state: ${existingData.length} collections found`, {
      count: existingData.length,
    });

    // Proceed with POST to populate
    log("[Log] Sending POST request to populate database");
    const response = await fetch("/api/collections", { method: "POST" });
    const result = await response.json();

    log(`[Response] POST response received: ${result.success ? "success" : "failed"}`, {
      success: result.success,
      message: result.message,
    });

    if (!response.ok) {
      err("[ERROR] Failed to seed collections:", {
        status: response.status,
        result: result,
      });
      throw new Error(`Failed to seed collections: ${result.message || "Unknown error"}`);
    }

    if (result.success) {
      log("[OK] Database seeded successfully", {
        insertedCount: result.count,
      });
    } else {
      err("[WARNING] Seeding completed with warnings:", result.message);
    }

    return result;
  } catch (error) {
    err("[FATAL] Fatal error during seeding:", error);
    throw error;
  }
}

export async function getCollections(): Promise<Collection[]> {
  log("[Fetch] Fetching collections");
  try {
    const response = await fetch("/api/collections");
    if (!response.ok) {
      throw new Error(`Failed to fetch collections: ${response.status}`);
    }
    const collections = await response.json();
    log(`[OK] Retrieved collections: ${collections.length} collections found`, {
      count: collections.length,
    });
    return collections;
  } catch (error) {
    err("[ERROR] Error fetching collections:", error);
    throw error;
  }
}
