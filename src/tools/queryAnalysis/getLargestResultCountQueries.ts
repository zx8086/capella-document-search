/* src/tools/queryAnalysis/getLargestResultCountQueries.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlLargestResultCountQueries } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_largest_result_count_queries",
    "Get queries that return the largest number of results",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      min_count: z.number().optional().describe("Minimum result count to include"),
    },
    async ({ limit, min_count }) => {
      logger.info("Getting largest result count queries", { limit, min_count });
      
      // Modify query based on parameters
      let query = n1qlLargestResultCountQueries;
      
      // Apply minimum count filter if specified
      if (min_count && min_count > 0) {
        query = query.replace(
          "LETTING avgResultCount = AVG(resultCount)",
          `LETTING avgResultCount = AVG(resultCount)
           HAVING avgResultCount >= ${min_count}`
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
        "Queries with Largest Result Counts"
      );
    }
  );
};
