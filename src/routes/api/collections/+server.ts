/* src/routes/api/collections/+server.ts */

import { json } from "@sveltejs/kit";
import {
  initializeDatabase,
  insertScope,
  insertCollection,
  getAllCollections,
} from "$lib/db/dbOperations";
import { getAllScopes } from "$lib/api";

export async function POST() {
  console.log("POST request received for collections");
  initializeDatabase();
  try {
    const scopesAndCollections = await getAllScopes();
    console.log("Received scopes and collections:", scopesAndCollections);

    let insertedCount = 0;
    for (const item of scopesAndCollections) {
      console.log("Inserting item:", item);
      const scopeResult = insertScope(item.bucket, item.scope);
      const collectionResult = insertCollection(
        item.bucket,
        item.scope,
        item.collection,
      );
      console.log("Scope insertion result:", scopeResult);
      console.log("Collection insertion result:", collectionResult);
      insertedCount++;
    }

    console.log("Inserted items count:", insertedCount);

    const allCollections = getAllCollections();
    console.log("All collections after insertion:", allCollections);

    return json({
      success: true,
      message: "Collections seeded successfully",
      count: insertedCount,
    });
  } catch (error) {
    console.error("Error seeding collections:", error);
    // @ts-ignore
    return json(
      {
        success: false,
        message: "Error seeding collections: " + error.message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  console.log("GET request received for collections");
  initializeDatabase();
  try {
    const collections = getAllCollections();
    console.log("Retrieved collections:", collections);
    return json(collections);
  } catch (error) {
    console.error("Error retrieving collections:", error);
    return json({ error: "Failed to retrieve collections" }, { status: 500 });
  }
}
