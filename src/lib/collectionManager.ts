/* src/lib/collectionManager.ts */

interface Collection {
  bucket: string;
  scope: string;
  collection: string;
}

export async function seedCollections() {
  try {
    const response = await fetch("/api/collections", { method: "POST" });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to seed collections. Status: ${response.status}, Error: ${errorText}`,
      );
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message);
    }
    console.log(`Collections seeded successfully. Count: ${result.count}`);
  } catch (error) {
    console.error("Error seeding collections:", error);
    throw error;
  }
}

export async function getCollections(): Promise<Collection[]> {
  try {
    const response = await fetch("/api/collections");
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`,
      );
    }
    const collections = await response.json();
    console.log("Retrieved collections:", collections);
    return collections;
  } catch (error) {
    console.error("Error fetching collections:", error);
    throw error;
  }
}
