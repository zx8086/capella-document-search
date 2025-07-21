/* src/tools/syncDocumentation.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../lib/logger";
import type { Bucket } from "couchbase";
import { createError } from "../lib/errors";
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from "../config";
import { connectionManager } from "../lib/connectionManager";

// Function to sanitize file paths to prevent directory traversal
const sanitizePath = (inputPath: string): string => {
  return path.normalize(inputPath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
};

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "sync_documentation_with_database",
    "Generate a documentation skeleton based on the database structure",
    {
      scope_name: z.string().optional().describe("Name of the scope to sync (optional, syncs all scopes if not provided)"),
    },
    async ({ scope_name }) => {
      if (!config.documentation?.enabled) {
        return {
          content: [
            { type: "text", text: "Documentation tools are disabled in the server configuration." }
          ]
        };
      }
      // Always define baseDirectory here
      const baseDirectory = config.documentation.baseDirectory || './docs';
      logger.debug("[sync_documentation_with_database] Debug info", {
        baseDirectory,
        cwd: process.cwd(),
        user: process.env.USER,
        uid: process.getuid && process.getuid(),
        gid: process.getgid && process.getgid(),
        scope_name
      });
      try {
        logger.info("Syncing documentation with database structure", {
          scope: scope_name
        });

        // Use system:keyspaces to get collections for the current bucket and scope
        const bucketName = config.database.bucketName;
        const cluster = connectionManager.getCluster();
        if (!cluster) {
          throw new Error("Cluster connection is not available");
        }
        const query = scope_name
          ? "SELECT `scope`, `name` AS collection_name FROM system:keyspaces WHERE `bucket` = $bucket AND `scope` = $scope"
          : "SELECT `scope`, `name` AS collection_name FROM system:keyspaces WHERE `bucket` = $bucket";
        const parameters = scope_name
          ? { scope: scope_name, bucket: bucketName }
          : { bucket: bucketName };
        logger.debug("[sync_documentation_with_database] Querying collections", { query, parameters });

        const result = await cluster.query(query, { parameters });
        logger.debug("[sync_documentation_with_database] Query result", { rows: result.rows });

        // Group collections by scope
        const scopes = new Map<string, Set<string>>();
        for (const row of result.rows) {
          const { scope, collection_name } = row;
          if (!scope || !collection_name) continue;
          if (!scopes.has(scope)) {
            scopes.set(scope, new Set());
          }
          scopes.get(scope)!.add(collection_name);
        }

        // Create documentation structure
        for (const [scope, collections] of scopes) {
          // Create scope directory and index
          const scopeDir = path.join(baseDirectory, sanitizePath(scope));
          logger.debug("[sync_documentation_with_database] Creating scopeDir", { scopeDir });
          await fs.mkdir(scopeDir, { recursive: true });

          const scopeIndexPath = path.join(scopeDir, `index${config.documentation?.fileExtension || '.md'}`);
          try {
            await fs.access(scopeIndexPath);
          } catch {
            // Create scope index if it doesn't exist
            logger.debug("[sync_documentation_with_database] Writing scope index", { scopeIndexPath });
            await fs.writeFile(scopeIndexPath, 
              `# ${scope} Scope\n\n` +
              `This scope contains the following collections:\n\n` +
              Array.from(collections).map(c => `- [${c}](docs://${scope}/${c})`).join('\n') + '\n'
            );
          }

          // Create collection directories and indexes
          for (const collection of collections) {
            const collectionDir = path.join(scopeDir, sanitizePath(collection));
            logger.debug("[sync_documentation_with_database] Creating collectionDir", { collectionDir });
            await fs.mkdir(collectionDir, { recursive: true });

            const collectionIndexPath = path.join(collectionDir, `index${config.documentation?.fileExtension || '.md'}`);
            try {
              await fs.access(collectionIndexPath);
            } catch {
              // Create collection index if it doesn't exist
              logger.debug("[sync_documentation_with_database] Writing collection index", { collectionIndexPath });
              await fs.writeFile(collectionIndexPath,
                `# ${collection} Collection\n\n` +
                `This collection is part of the [${scope}](docs://${scope}) scope.\n\n` +
                `## Schema\n\n` +
                `The schema for this collection will be documented here.\n\n` +
                `## Usage\n\n` +
                `Documentation for using this collection will be added here.\n`
              );
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Documentation structure successfully synchronized with database.\n` +
                    `Generated documentation for ${scopes.size} scope(s) and ` +
                    `${Array.from(scopes.values()).reduce((sum, cols) => sum + cols.size, 0)} collection(s).`
            }
          ]
        };
      } catch (error) {
        logger.error("Error syncing documentation", {
          error: error instanceof Error ? error.stack || error.message : String(error),
          scope: scope_name
        });
        throw error;
      }
    }
  );
}; 