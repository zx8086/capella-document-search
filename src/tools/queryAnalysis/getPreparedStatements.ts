/* src/tools/queryAnalysis/getPreparedStatements.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlPreparedStatements } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_prepared_statements",
    "Get information about prepared statements in the query engine",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
    },
    async ({ limit }) => {
      logger.info("Getting prepared statements", { limit });
      
      // Modify query based on parameters
      let query = n1qlPreparedStatements;
      
      // Apply limit if specified
      if (limit && limit > 0) {
        // Add or replace LIMIT clause
        if (query.includes("LIMIT")) {
          query = query.replace(/LIMIT \d+/i, `LIMIT ${limit}`);
        } else {
          query = `${query.replace(';', '')} LIMIT ${limit};`;
        }
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Prepared Statements"
      );
    }
  );
};
