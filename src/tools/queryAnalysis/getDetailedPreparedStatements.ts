/* src/tools/queryAnalysis/getDetailedPreparedStatements.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { detailedPreparedStatementsQuery } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_detailed_prepared_statements",
    "Get detailed information about prepared statements with usage statistics",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      node_filter: z.string().optional().describe("Filter by node name (e.g., 'node1.example.com:8091')"),
      query_pattern: z.string().optional().describe("Filter by query pattern (e.g., 'SELECT')"),
    },
    async ({ limit, node_filter, query_pattern }) => {
      logger.info("Getting detailed prepared statements", { limit, node_filter, query_pattern });
      
      // Modify query based on parameters
      let query = detailedPreparedStatementsQuery;
      
      // Build WHERE clause for additional filters
      const whereClauses = [];
      
      if (node_filter) {
        whereClauses.push(`node LIKE "%${node_filter}%"`);
      }
      
      if (query_pattern) {
        whereClauses.push(`statement LIKE "%${query_pattern}%"`);
      }
      
      // Apply WHERE clauses if any
      if (whereClauses.length > 0) {
        if (query.includes("WHERE")) {
          // Add to existing WHERE clause
          query = query.replace(/WHERE/i, `WHERE ${whereClauses.join(' AND ')} AND`);
        } else if (query.includes("ORDER BY")) {
          // Insert before ORDER BY
          query = query.replace(/ORDER BY/i, `WHERE ${whereClauses.join(' AND ')} ORDER BY`);
        } else {
          // Add before the semicolon
          query = query.replace(';', ` WHERE ${whereClauses.join(' AND ')};`);
        }
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        // Add or replace LIMIT clause
        if (query.includes("LIMIT")) {
          query = query.replace(/LIMIT \d+/i, `LIMIT ${limit}`);
        } else {
          query = query.replace(';', ` LIMIT ${limit};`);
        }
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Prepared Statements Analysis"
      );
    }
  );
};
