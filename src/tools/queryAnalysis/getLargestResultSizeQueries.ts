/* src/tools/queryAnalysis/getLargestResultSizeQueries.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlLargestResultSizeQueries } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_largest_result_size_queries",
    "Get queries that return the largest result sizes in bytes",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      min_size_kb: z.number().optional().describe("Minimum result size in KB to include"),
    },
    async ({ limit, min_size_kb }) => {
      logger.info("Getting largest result size queries", { limit, min_size_kb });
      
      // Modify query based on parameters
      let query = n1qlLargestResultSizeQueries;
      
      // Apply minimum size filter if specified
      if (min_size_kb && min_size_kb > 0) {
        // Convert KB to bytes for filtering
        const minSizeBytes = min_size_kb * 1000;
        
        query = query.replace(
          "LETTING avgResultSize = AVG(resultSize)",
          `LETTING avgResultSize = AVG(resultSize)
           HAVING avgResultSize >= ${minSizeBytes}`
        );
      }
      
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
        "Queries with Largest Result Sizes"
      );
    }
  );
};
