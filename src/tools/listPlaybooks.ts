/* src/tools/listPlaybooks.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { config } from "../config";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "list_playbooks",
    "List all available playbooks",
    {},
    async () => {
      try {
        logger.info("Listing available playbooks");
        
        // Use the server's readResourceByUri method to access the playbook directory
        const resourceResult = await (server as any).readResourceByUri("playbook://");
        
        if (!resourceResult || !resourceResult.contents || resourceResult.contents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No playbooks found"
              }
            ]
          };
        }
        
        return {
          content: resourceResult.contents.map(content => ({
            type: content.mimeType === "text/markdown" ? "text" : "text",
            text: content.text || "[Binary content]"
          }))
        };
      } catch (error) {
        logger.error("Error in list_playbooks tool", { 
          error: error instanceof Error ? error.message : String(error)
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Error listing playbooks: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  
  server.tool(
    "get_playbook",
    "Get a specific playbook by ID",
    {
      playbook_id: z.string().describe("ID of the playbook to retrieve"),
    },
    async ({ playbook_id }) => {
      try {
        logger.info("Getting playbook", { playbook_id });
        
        const resourceUri = `playbook://${playbook_id}`;
        const resourceResult = await (server as any).readResourceByUri(resourceUri);
        
        if (!resourceResult || !resourceResult.contents || resourceResult.contents.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Playbook not found: ${playbook_id}`
              }
            ]
          };
        }
        
        return {
          content: resourceResult.contents.map(content => ({
            type: content.mimeType === "text/markdown" ? "text" : "text",
            text: content.text || "[Binary content]"
          }))
        };
      } catch (error) {
        logger.error("Error in get_playbook tool", { 
          error: error instanceof Error ? error.message : String(error),
          playbook_id
        });
        
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving playbook: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
};