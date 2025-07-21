/* src/tools/deleteDocumentation.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { createError } from "../lib/errors";
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from "../config";

// Function to sanitize file paths to prevent directory traversal
const sanitizePath = (inputPath: string): string => {
  return path.normalize(inputPath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
};

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "delete_documentation",
    "Delete documentation for a scope, collection, or specific file",
    {
      scope_name: z.string().describe("Name of the scope"),
      collection_name: z.string().optional().describe("Name of the collection (optional)"),
      file_name: z.string().optional().describe("Name of the document file (without extension, optional)"),
      recursive: z.boolean().optional().describe("Whether to recursively delete all documentation under the specified path"),
    },
    async ({ scope_name, collection_name, file_name, recursive }) => {
      if (!config.documentation?.enabled) {
        return {
          content: [
            { type: "text", text: "Documentation tools are disabled in the server configuration." }
          ]
        };
      }
      // Always define baseDirectory here
      const baseDirectory = config.documentation.baseDirectory || './docs';
      try {
        logger.info("Deleting documentation", {
          scope: scope_name,
          collection: collection_name,
          file: file_name,
          recursive
        });

        // Determine the path for the documentation
        let docPath: string;
        if (collection_name && file_name) {
          // Specific file in collection
          docPath = path.join(baseDirectory, sanitizePath(scope_name), sanitizePath(collection_name), 
            `${sanitizePath(file_name)}${config.documentation?.fileExtension || '.md'}`);
        } else if (collection_name) {
          // Collection directory
          docPath = path.join(baseDirectory, sanitizePath(scope_name), sanitizePath(collection_name));
        } else {
          // Scope directory
          docPath = path.join(baseDirectory, sanitizePath(scope_name));
        }

        // Check if the path exists
        try {
          await fs.access(docPath);
        } catch (error) {
          throw createError("NOT_FOUND", "Documentation not found at the specified path");
        }

        // Delete the documentation
        if (recursive && (collection_name || !file_name)) {
          await fs.rm(docPath, { recursive: true, force: true });
        } else {
          await fs.unlink(docPath);
        }

        return {
          content: [
            {
              type: "text",
              text: `Documentation successfully deleted at ${path.relative(baseDirectory, docPath)}`
            }
          ]
        };
      } catch (error) {
        logger.error("Error deleting documentation", {
          error: error instanceof Error ? error.message : String(error),
          scope: scope_name,
          collection: collection_name,
          file: file_name
        });
        throw error;
      }
    }
  );
}; 