/* src/tools/getDocumentById.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_document_by_id",
    "Get a document by ID from a specific scope and collection",
    {
      scope_name: z.string().describe("Name of the scope"),
      collection_name: z.string().describe("Name of the collection"),
      document_id: z.string().describe("ID of the document to retrieve"),
    },
    async ({ scope_name, collection_name, document_id }) => {
      const collection = bucket.scope(scope_name).collection(collection_name);
      const result = await collection.get(document_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result.content, null, 2),
          },
        ],
      };
    }
  );
};
