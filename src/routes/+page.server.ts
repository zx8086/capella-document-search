/* src/routes/+page.server.ts */

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";
import fetch from "cross-fetch";
import type { Actions } from "./$types";
import { error } from "@sveltejs/kit";

const YOUR_GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";
const client = new ApolloClient({
  link: createHttpLink({ uri: YOUR_GRAPHQL_ENDPOINT, fetch }),
  cache: new InMemoryCache(),
});

// Mock collections data
const mockCollections = [
  { bucket: "default", scope: "prices", collection: "prices" },
  { bucket: "default", scope: "order", collection: "archived-orders" },
  { bucket: "default", scope: "order", collection: "archived-order-items" },
  { bucket: "default", scope: "new_model", collection: "seasonal_assignment" },
  { bucket: "default", scope: "new_model", collection: "product2g" },
  { bucket: "default", scope: "new_model", collection: "variant" },
  { bucket: "default", scope: "new_model", collection: "article" },
  { bucket: "default", scope: "seasons", collection: "retry_notifications" },
  { bucket: "default", scope: "seasons", collection: "delivery_dates_import" },
  { bucket: "default", scope: "seasons", collection: "delivery_dates" },
  { bucket: "default", scope: "seasons", collection: "dates_import" },
  { bucket: "default", scope: "seasons", collection: "dates" },
  {
    bucket: "default",
    scope: "brands_divisions",
    collection: "retry_notifications",
  },
  {
    bucket: "default",
    scope: "brands_divisions",
    collection: "brands_divisions",
  },
  { bucket: "default", scope: "eventing", collection: "metadata" },
  { bucket: "default", scope: "media_assets", collection: "images" },
  {
    bucket: "default",
    scope: "media_assets",
    collection: "retry_notifications",
  },
  { bucket: "default", scope: "media_assets", collection: "look_items" },
  { bucket: "default", scope: "styles", collection: "prepacks" },
  {
    bucket: "default",
    scope: "styles",
    collection: "retry_rich_notifications",
  },
  { bucket: "default", scope: "styles", collection: "distribution_curves" },
  { bucket: "default", scope: "styles", collection: "retry_notifications" },
  { bucket: "default", scope: "styles", collection: "eventing" },
  { bucket: "default", scope: "styles", collection: "variant" },
  { bucket: "default", scope: "styles", collection: "article" },
  { bucket: "default", scope: "styles", collection: "product2g" },
  { bucket: "default", scope: "styles_notifications", collection: "retry" },
  { bucket: "default", scope: "styles_notifications", collection: "metadata" },
  { bucket: "default", scope: "customer", collection: "assignments" },
  { bucket: "default", scope: "customer", collection: "sales-organizations" },
  { bucket: "default", scope: "customer", collection: "customers" },
];

export const actions: Actions = {
  searchDocuments: async ({ request }) => {
    try {
      const data = await request.formData();
      const collections = JSON.parse(data.get("collections") as string);
      const documentKey = data.get("documentKey") as string;
      const keys = [documentKey];

      console.log("Collections:", collections);
      console.log("Keys:", keys);

      // Ensure collections are in the correct format
      const formattedCollections = collections.map(
        ({ bucket, scope_name, collection_name }) => ({
          bucket,
          scope: scope_name,
          collection: collection_name,
        }),
      );

      const query = gql`
        query searchDocuments(
          $collections: [BucketScopeCollection!]!
          $keys: [String!]!
        ) {
          searchDocuments(collections: $collections, keys: $keys) {
            bucket
            scope
            collection
            data
            timeTaken
          }
        }
      `;

      const response = await client.query({
        query,
        variables: {
          collections: formattedCollections,
          keys,
        },
        fetchPolicy: "no-cache", // Disable caching for this query
      });

      console.log("GraphQL Response:", response.data);

      return {
        type: "success",
        data: response.data,
      };
    } catch (error) {
      console.error("Error in searchDocuments action:", error);
      if (error.graphQLErrors) {
        console.error("GraphQL Errors:", error.graphQLErrors);
      }
      if (error.networkError) {
        console.error("Network Error:", error.networkError);
      }
      return {
        type: "error",
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      };
    }
  },
  uploadFile: async ({ request }) => {
    try {
      const data = await request.formData();
      const file = data.get("file") as File | null;

      if (!file) {
        throw error(400, "No file uploaded");
      }

      // Process the CSV file
      const content = await file.text();
      const documentKeys = content.split(",").map((key) => key.trim());

      // Use the mock collections data to search for each document key
      const results = await Promise.all(
        documentKeys.map(async (key) => {
          const query = gql`
            query searchDocuments(
              $collections: [BucketScopeCollection!]!
              $keys: [String!]!
            ) {
              searchDocuments(collections: $collections, keys: $keys) {
                bucket
                scope
                collection
                data
                timeTaken
              }
            }
          `;

          const response = await client.query({
            query,
            variables: {
              collections: mockCollections,
              keys: [key],
            },
            fetchPolicy: "no-cache",
          });

          const searchResults = response.data.searchDocuments;

          // Filter out collections where the document wasn't found
          const foundCollections = searchResults.filter(
            (result) => result.data !== null,
          );

          return {
            documentKey: key,
            found: foundCollections.length > 0,
            collections: foundCollections.map(
              ({ bucket, scope, collection, timeTaken }) => ({
                bucket,
                scope,
                collection,
                timeTaken,
              }),
            ),
          };
        }),
      );

      console.log("File upload results:", results); // Add this line for debugging

      return results;
    } catch (e) {
      console.error("Error in uploadFile action:", e);
      throw error(
        500,
        e instanceof Error ? e.message : "An unknown error occurred",
      );
    }
  },
};
