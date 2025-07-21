/* src/tools/listDocumentation.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { config } from "../config";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "list_documentation",
    "List available documentation resources",
    {
      scope_name: z.string().optional().describe("Name of the scope to list documentation for"),
      collection_name: z.string().optional().describe("Name of the collection to list documentation for"),
    },
    async ({ scope_name, collection_name }) => {
      if (!config.documentation?.enabled) {
        return {
          content: [
            { type: "text", text: "Documentation tools are disabled in the server configuration." }
          ]
        };
      }
      
      let resourceUri: string;
      
      if (!scope_name) {
        resourceUri = 'docs://';
      } else if (collection_name) {
        resourceUri = `docs://${scope_name}/${collection_name}`;
      } else {
        resourceUri = `docs://${scope_name}`;
      }
      
      try {
        logger.info("Listing documentation", {
          resourceUri,
          scope: scope_name,
          collection: collection_name
        });
        
        // Use the resource URI handler to get documentation listing
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
        logger.error("Error listing documentation", {
          error: error instanceof Error ? error.message : String(error),
          resourceUri,
          scope: scope_name,
          collection: collection_name
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Error listing documentation: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
};