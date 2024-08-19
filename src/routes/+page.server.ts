/* src/routes/+page.server.ts */

import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";
import fetch from "cross-fetch";
import type { Actions, PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import {
  getFormattedCollections,
  initializeDatabase,
} from "$lib/db/dbOperations";
import { log, err } from "$utils/unifiedLogger";

const YOUR_GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";
const client = new ApolloClient({
  link: createHttpLink({ uri: YOUR_GRAPHQL_ENDPOINT, fetch }),
  cache: new InMemoryCache(),
});

initializeDatabase();

export const load: PageServerLoad = async () => {
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

      // log("Selected Collections:", selectedCollections);
      log("Keys:", keys);

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

      // log("GraphQL Response:", response.data);

      return {
        type: "success",
        data: response.data,
      };
    } catch (error) {
      err("Error in searchDocuments action:", error);
      if (error.graphQLErrors) {
        err("GraphQL Errors:", error.graphQLErrors);
      }
      if (error.networkError) {
        err("Network Error:", error.networkError);
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
      log("Starting uploadFile action");
      const data = await request.formData();
      const file = data.get("file") as File | null;

      if (!file) {
        log("No file uploaded");
        throw error(400, "No file uploaded");
      }

      log("File received:", file.name);

      const content = await file.text();
      const documentKeys = content
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
      log("Document keys extracted:", documentKeys);

      // Check if the number of document keys exceeds the limit
      const DOCUMENT_KEY_LIMIT = 50;
      if (documentKeys.length > DOCUMENT_KEY_LIMIT) {
        log(
          `Document key limit exceeded: ${documentKeys.length} keys found, limit is ${DOCUMENT_KEY_LIMIT}`,
        );
        return {
          error: `Too many document keys. The limit is ${DOCUMENT_KEY_LIMIT}. Found ${documentKeys.length} keys.`,
        };
      }

      const collections = getFormattedCollections();

      const results = await Promise.all(
        documentKeys.map(async (key) => {
          log(`Searching for document key: ${key}`);
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

      log("Final results:", JSON.stringify(results, null, 2));

      return results;
    } catch (e) {
      err("Error in uploadFile action:", e);
      throw error(
        500,
        e instanceof Error ? e.message : "An unknown error occurred",
      );
    }
  },
};
