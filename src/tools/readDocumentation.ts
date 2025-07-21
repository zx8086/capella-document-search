/* src/tools/readDocumentation.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { z } from "zod";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "read_documentation",
    "Read documentation content using the resource protocol",
    {
      scope_name: z.string().optional().describe("Name of the scope (optional)"),
      collection_name: z.string().optional().describe("Name of the collection (optional)"),
      file_name: z.string().optional().describe("Name of the document file (without extension, optional)"),
    },
    async ({ scope_name, collection_name, file_name }) => {
      let resourceUri: string;
      
      if (!scope_name) {
        resourceUri = 'docs://';
      } else if (collection_name && file_name) {
        resourceUri = `docs://${scope_name}/${collection_name}/${file_name}`;
      } else if (collection_name) {
        resourceUri = `docs://${scope_name}/${collection_name}`;
      } else {
        resourceUri = `docs://${scope_name}`;
      }
      
      try {
        logger.info("Reading documentation", {
          resourceUri,
          scope: scope_name,
          collection: collection_name,
          file: file_name
        });
        
        const resourceResult = await (server as any).readResourceByUri(resourceUri);
        
        if (!resourceResult || !resourceResult.contents || resourceResult.contents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No documentation found at ${resourceUri}`
              }
            ]
          };
        }
        
        // Map the resource content to the tool response format
        return {
          content: resourceResult.contents.map(content => ({
            type: "text",
            text: content.text || `[Binary content of type ${content.mimeType}]`
          }))
        };
      } catch (error) {
        logger.error("Error reading documentation", {
          error: error instanceof Error ? error.message : String(error),
          resourceUri,
          scope: scope_name,
          collection: collection_name,
          file: file_name
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Error reading documentation: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
};