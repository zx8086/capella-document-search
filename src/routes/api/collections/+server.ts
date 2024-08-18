/* src/routes/api/collections/+server.ts */

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
  console.log("POST request received for collections");
  initializeDatabase();
  const db = getDatabase();

  try {
    const scopesAndCollections = await getAllScopes();
    console.log("Received scopes and collections:", scopesAndCollections);
    if (scopesAndCollections.length === 0) {
      console.warn("No scopes and collections returned from API");
      return json(
        {
          success: false,
          message: "No scopes and collections available to seed",
        },
        { status: 404 },
      );
    }

    let insertedCount = 0;

    // Use a transaction for atomicity
    db.transaction(() => {
      for (const item of scopesAndCollections) {
        console.log("Inserting item:", item);
        const scopeResult = insertScope(item.bucket, item.scope);
        const collectionResult = insertCollection(
          item.bucket,
          item.scope,
          item.collection,
        );
        // Insert a mock tooltip for demonstration purposes
        const tooltipResult = insertTooltip(
          item.bucket,
          item.scope,
          item.collection,
          `This is a mock tooltip for ${item.bucket}.${item.scope}.${item.collection}`,
        );
        console.log("Scope insertion result:", scopeResult);
        console.log("Collection insertion result:", collectionResult);
        console.log("Tooltip insertion result:", tooltipResult);
        insertedCount++;
      }
    })();

    console.log("Inserted items count:", insertedCount);
    const allCollections = getAllCollectionsWithTooltips();
    console.log(
      "All collections with tooltips after insertion:",
      allCollections,
    );
    return json({
      success: true,
      message: "Collections and tooltips seeded successfully",
      count: insertedCount,
    });
  } catch (error) {
    console.error("Error seeding collections and tooltips:", error);
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
  // GET function remains unchanged
  console.log("GET request received for collections");
  initializeDatabase();
  try {
    const collectionsWithTooltips = getAllCollectionsWithTooltips();
    console.log(
      "Retrieved collections with tooltips:",
      collectionsWithTooltips,
    );
    return json(collectionsWithTooltips);
  } catch (error) {
    console.error("Error retrieving collections with tooltips:", error);
    return json(
      { error: "Failed to retrieve collections with tooltips" },
      { status: 500 },
    );
  }
}
