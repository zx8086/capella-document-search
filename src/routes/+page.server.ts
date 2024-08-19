/* src/routes/+page.server.ts */

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";
import fetch from "cross-fetch";
import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import {
  getFormattedCollections,
  initializeDatabase,
} from "$lib/db/dbOperations";
import { log, warn, debug } from "$utils/logger";

const YOUR_GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";
const client = new ApolloClient({
  link: createHttpLink({ uri: YOUR_GRAPHQL_ENDPOINT, fetch }),
  cache: new InMemoryCache(),
});

initializeDatabase();

export const load: PageServerLoad = async () => {
  log("Test");
  const collections = getFormattedCollections();
  return { collections };
};

export const actions: Actions = {
  searchDocuments: async ({ request }) => {
    try {
      const data = await request.formData();
      const selectedCollections = JSON.parse(data.get("collections") as string);
      const documentKey = data.get("documentKey") as string;
      const keys = [documentKey];

      console.log("Selected Collections:", selectedCollections);
      console.log("Keys:", keys);

      const formattedCollections = selectedCollections.map(
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
        fetchPolicy: "no-cache",
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
      console.log("Starting uploadFile action");
      const data = await request.formData();
      const file = data.get("file") as File | null;

      if (!file) {
        console.log("No file uploaded");
        return fail(400, { error: "No file uploaded" });
      }

      console.log("File received:", file.name);

      const content = await file.text();
      const documentKeys = content.split(",").map((key) => key.trim());

      const MAX_KEYS = 50;
      if (documentKeys.length > MAX_KEYS) {
        console.log(
          `Too many document keys: ${documentKeys.length}. Limit is ${MAX_KEYS}.`,
        );
        return fail(400, {
          error: `Too many document keys. Maximum allowed is ${MAX_KEYS}.`,
        });
      }

      console.log(`Document keys extracted: ${documentKeys.length}`);

      // Get the collections here, inside the action
      const collections = getFormattedCollections();

      // Use all collections to search for each document key
      const results = await Promise.all(
        documentKeys.map(async (key) => {
          console.log(`Searching for document key: ${key}`);
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
              collections,
              keys: [key],
            },
            fetchPolicy: "no-cache",
          });

          const searchResults = response.data.searchDocuments;

          const foundCollections = searchResults.filter(
            (result) => result.data !== null,
          );
          const notFoundCollections = searchResults.filter(
            (result) => result.data === null,
          );

          return {
            documentKey: key,
            found: foundCollections.length > 0,
            foundIn: foundCollections.map(
              ({ bucket, scope, collection, timeTaken }) => ({
                bucket,
                scope,
                collection,
                timeTaken,
              }),
            ),
            notFoundIn: notFoundCollections.map(
              ({ bucket, scope, collection }) => ({
                bucket,
                scope,
                collection,
              }),
            ),
            totalCollectionsSearched: searchResults.length,
          };
        }),
      );

      console.log("Final results:", JSON.stringify(results, null, 2));

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
