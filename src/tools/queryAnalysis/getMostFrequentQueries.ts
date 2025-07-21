/* src/tools/queryAnalysis/getMostFrequentQueries.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlMostFrequentQueries } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_most_frequent_queries",
    "Get the most frequently executed queries",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      min_count: z.number().optional().describe("Minimum execution count to include"),
    },
    async ({ limit, min_count }) => {
      logger.info("Getting most frequent queries", { limit, min_count });
      
      // Modify query based on parameters
      let query = n1qlMostFrequentQueries;
      
      // Apply minimum count filter if specified
      if (min_count && min_count > 0) {
        query = query.replace(
          "LETTING queries = COUNT(1)",
          `LETTING queries = COUNT(1)
           HAVING queries >= ${min_count}`
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
        "Most Frequently Executed Queries"
      );
    }
  );
};
