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
import { log, err, debug } from "../utils/serverLogger";
import { backendConfig } from "$backendConfig";

import type { Collection, SearchResult } from "../models";

const GRAPHQL_ENDPOINT = backendConfig.application.GRAPHQL_ENDPOINT;
const client = new ApolloClient({
  link: createHttpLink({ uri: GRAPHQL_ENDPOINT, fetch }),
  cache: new InMemoryCache(),
});

initializeDatabase();

export const load: PageServerLoad = async () => {
  log("Calling function - getFormattedCollections()");
  const fetchedCollections = getFormattedCollections();
  log("Retrieved collections:", { meta: { collections: fetchedCollections } });

  const mappedCollections: Collection[] = fetchedCollections.map((c) => ({
    bucket: c.bucket,
    scope_name: c.scope,
    collection_name: c.collection,
  }));

  return { collections: mappedCollections };
};

export const actions: Actions = {
  searchDocuments: async ({ request }) => {
    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const data = await request.formData();
        const selectedCollections = JSON.parse(
          data.get("collections") as string,
        ) as Collection[];
        const documentKey = data.get("documentKey") as string;
        const keys = [documentKey];

        log("Keys:", { meta: { keys } });

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

        const searchResults: SearchResult[] = response.data.searchDocuments;
        const foundCollectionsCount = searchResults.filter(
          (result) => result.data !== null,
        ).length;

        const returnData = {
          type: "success",
          data: response.data,
          foundCollectionsCount: foundCollectionsCount,
        };

        debug(
          "Data being returned from searchDocuments action:",
          JSON.stringify(returnData, null, 2),
        );

        return returnData;
      } catch (error: unknown) {
        retries++;
        err(`Error in searchDocuments action (attempt ${retries}):`, error);

        if (error instanceof Error) {
          if (
            (error as any).networkError?.message.includes(
              "socket connection was closed unexpectedly",
            )
          ) {
            if (retries < MAX_RETRIES) {
              log(`Retrying search (attempt ${retries + 1})...`);
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * retries),
              ); // Exponential backoff
              continue;
            } else {
              return {
                type: "error",
                error: "Network connection issue. Please try again later.",
                details:
                  "The connection to the server was interrupted. This might be due to network instability or server issues.",
              };
            }
          }

          if ("graphQLErrors" in error) {
            err("GraphQL Errors:", (error as any).graphQLErrors);
            return {
              type: "error",
              error: "An error occurred while processing your request.",
              details: (error as any).graphQLErrors
                .map((e: any) => e.message)
                .join(", "),
            };
          }

          if ("networkError" in error && (error as any).networkError) {
            err("Network Error:", (error as any).networkError);
            return {
              type: "error",
              error: "A network error occurred.",
              details:
                (error as any).networkError.message ||
                "Unable to connect to the server.",
            };
          }
        }

        return {
          type: "error",
          error: "An unexpected error occurred",
          details: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return {
      type: "error",
      error: "Failed to complete the search after multiple attempts",
      details:
        "Please try again later or contact support if the issue persists.",
    };
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

      log("File received:", file);

      const content = await file.text();
      const documentKeys = content
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
      log("Document keys extracted", { meta: { documentKeys } });

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
            (result: any) => result.data !== null,
          );
          const notFoundCollections = searchResults.filter(
            (result: any) => result.data === null,
          );

          return {
            documentKey: key,
            found: foundCollections.length > 0,
            foundIn: foundCollections.map(
              ({
                bucket,
                scope,
                collection,
                timeTaken,
              }: {
                bucket: string;
                scope: string;
                collection: string;
                timeTaken: number;
              }) => ({
                bucket,
                scope,
                collection,
                timeTaken,
              }),
            ),
            notFoundIn: notFoundCollections.map(
              ({
                bucket,
                scope,
                collection,
              }: {
                bucket: string;
                scope: string;
                collection: string;
              }) => ({
                bucket,
                scope,
                collection,
              }),
            ),
            totalCollectionsSearched: searchResults.length,
          };
        }),
      );

      return {
        success: `File processed successfully. ${documentKeys.length} Document Keys searched.`,
        results,
      };
    } catch (e) {
      err("Error in uploadFile action:", e);
      throw error(
        500,
        e instanceof Error ? e.message : "An unknown error occurred",
      );
    }
  },
};
