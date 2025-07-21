/* src/tools/createDocumentation.ts */

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
    "create_documentation",
    "Create or update documentation for a scope, collection, or specific file",
    {
      scope_name: z.string().describe("Name of the scope"),
      collection_name: z.string().optional().describe("Name of the collection (optional)"),
      file_name: z.string().optional().describe("Name of the document file (without extension, optional)"),
      content: z.string().describe("Markdown content for the documentation"),
    },
    async ({ scope_name, collection_name, file_name, content }) => {
      if (!config.documentation?.enabled) {
        return {
          content: [
            { type: "text", text: "Documentation tools are disabled in the server configuration." }
          ]
        };
      }
      // Always define baseDirectory here
      const baseDirectory = config.documentation.baseDirectory || './docs';
      // Debugging logs
      logger.debug("[create_documentation] Debug info", {
        baseDirectory,
        cwd: process.cwd(),
        user: process.env.USER,
        uid: process.getuid && process.getuid(),
        gid: process.getgid && process.getgid(),
        scope_name,
        collection_name,
        file_name
      });
      try {
        logger.info("Creating/updating documentation", {
          scope: scope_name,
          collection: collection_name,
          file: file_name
        });

        if (!content) {
          throw createError("VALIDATION_ERROR", "Content is required");
        }

        // Determine the path for the documentation
        let docPath: string;
        if (collection_name && file_name) {
          // Specific file in collection
          const collectionDir = path.join(baseDirectory, sanitizePath(scope_name), sanitizePath(collection_name));
          await fs.mkdir(collectionDir, { recursive: true });
          docPath = path.join(collectionDir, `${sanitizePath(file_name)}${config.documentation?.fileExtension || '.md'}`);
        } else if (collection_name) {
          // Collection index file
          const collectionDir = path.join(baseDirectory, sanitizePath(scope_name), sanitizePath(collection_name));
          await fs.mkdir(collectionDir, { recursive: true });
          docPath = path.join(collectionDir, `index${config.documentation?.fileExtension || '.md'}`);
        } else {
          // Scope index file
          const scopeDir = path.join(baseDirectory, sanitizePath(scope_name));
          await fs.mkdir(scopeDir, { recursive: true });
          docPath = path.join(scopeDir, `index${config.documentation?.fileExtension || '.md'}`);
        }
        // Debugging log for docPath
        logger.debug("[create_documentation] Writing documentation file to", { docPath });

        // Write the documentation file
        await fs.writeFile(docPath, content, 'utf-8');

        const filePath = path.relative(baseDirectory, docPath);
        const docsUri = collection_name && file_name 
          ? `docs://${scope_name}/${collection_name}/${file_name}`
          : collection_name 
            ? `docs://${scope_name}/${collection_name}` 
            : `docs://${scope_name}`;
            
        return {
          content: [
            {
              type: "text",
              text: `Documentation successfully created/updated at ${filePath}\nAccess it via resource URI: ${docsUri}`
            }
          ]
        };
      } catch (error) {
        logger.error("Error creating/updating documentation", {
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