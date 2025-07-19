/* src/lib/collectionManager.ts */

import { log, err } from "$utils/unifiedLogger";
import { collections } from "../stores/collectionsStore";
import type { Collection } from "../models";

export async function seedCollections() {
  log("🌱 Starting database seeding process");
  try {
    // First check if we already have data
    const checkResponse = await fetch("/api/collections");
    const existingData = await checkResponse.json();
    log(`📊 Current database state: ${existingData.length} collections found`, { count: existingData.length });

    // Proceed with POST to populate
    log("📝 Sending POST request to populate database");
    const response = await fetch("/api/collections", { method: "POST" });
    const result = await response.json();
    
    log(`📬 POST response received: ${result.success ? 'success' : 'failed'}`, { success: result.success, message: result.message });

    if (!response.ok) {
      err("❌ Failed to seed collections:", {
        status: response.status,
        result: result
      });
      throw new Error(`Failed to seed collections: ${result.message || 'Unknown error'}`);
    }

    if (result.success) {
      log("✅ Database seeded successfully", {
        insertedCount: result.count
      });
    } else {
      err("⚠️ Seeding completed with warnings:", result.message);
    }

    return result;
  } catch (error) {
    err("💥 Fatal error during seeding:", error);
    throw error;
  }
}

export async function getCollections(): Promise<Collection[]> {
  log("📥 Fetching collections");
  try {
    const response = await fetch("/api/collections");
    if (!response.ok) {
      throw new Error(`Failed to fetch collections: ${response.status}`);
    }
    const collections = await response.json();
    log(`📦 Retrieved collections: ${collections.length} collections found`, { count: collections.length });
    return collections;
  } catch (error) {
    err("💥 Error fetching collections:", error);
    throw error;
  }
}
