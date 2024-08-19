/* src/routes/api/collections/+server.ts */

import { log, warn, err } from "$utils/unifiedLogger";
import { json } from "@sveltejs/kit";
import {
  initializeDatabase,
  insertScope,
  insertCollection,
  insertTooltip,
  getAllCollectionsWithTooltips,
  getDatabase,
} from "$lib/db/dbOperations";
import { getAllScopes } from "$lib/api";

export async function POST() {
  log("POST request received for collections");
  initializeDatabase();
  const db = getDatabase();

  try {
    const scopesAndCollections = await getAllScopes();
    log("Received scopes and collections:");
    if (scopesAndCollections.length === 0) {
      warn("No scopes and collections returned from API");
      return json(
        {
          success: false,
          message: "No scopes and collections available to seed",
        },
        { status: 404 },
      );
    }

    let insertedCount = 0;

    db.transaction(() => {
      for (const item of scopesAndCollections) {
        log("Inserting item:", item);
        const scopeResult = insertScope(item.bucket, item.scope);
        const collectionResult = insertCollection(
          item.bucket,
          item.scope,
          item.collection,
        );
        const tooltipResult = insertTooltip(
          item.bucket,
          item.scope,
          item.collection,
          `This is a mock tooltip for ${item.bucket}.${item.scope}.${item.collection}`,
        );
        log("Scope insertion result:", scopeResult);
        log("Collection insertion result:", collectionResult);
        log("Tooltip insertion result:", tooltipResult);
        insertedCount++;
      }
    })();

    log("Inserted items count:", insertedCount);
    const allCollections = getAllCollectionsWithTooltips();
    log("All collections with tooltips after insertion:", allCollections);
    return json({
      success: true,
      message: "Collections and tooltips seeded successfully",
      count: insertedCount,
    });
  } catch (error) {
    err("Error seeding collections and tooltips:", error);
    return json(
      {
        success: false,
        message:
          "Error seeding collections and tooltips: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  log("GET request received for collections");
  initializeDatabase();
  try {
    const collectionsWithTooltips = getAllCollectionsWithTooltips();
    log("Retrieved collections with tooltips:", collectionsWithTooltips);
    return json(collectionsWithTooltips);
  } catch (error) {
    err("Error retrieving collections with tooltips:", error);
    return json(
      { error: "Failed to retrieve collections with tooltips" },
      { status: 500 },
    );
  }
}
