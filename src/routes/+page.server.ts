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
      // @ts-ignore
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
      // @ts-ignore
      if (error.graphQLErrors) {
        // @ts-ignore
        console.error("GraphQL Errors:", error.graphQLErrors);
      }
      // @ts-ignore
      if (error.networkError) {
        // @ts-ignore
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
      const collections = JSON.parse(data.get("collections") as string);

      if (!file) {
        throw error(400, "No file uploaded");
      }

      // Process the CSV file
      const content = await file.text();
      const documentKeys = content.split(",").map((key) => key.trim());

      // Use the collections data to search for each document key
      const results = await Promise.all(
        documentKeys.map(async (key) => {
          // Perform your search logic here using the key and collections
          // Return the search result for each key
        }),
      );

      return {
        type: "success",
        data: results,
      };
    } catch (e) {
      console.error("Error in uploadFile action:", e);
      throw error(
        500,
        e instanceof Error ? e.message : "An unknown error occurred",
      );
    }
  },
};
