/* src/tools/queryAnalysis/getLongestRunningQueries.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlLongestRunningQueries } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_longest_running_queries",
    "Get the longest running queries based on service time",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      min_time_ms: z.number().optional().describe("Minimum execution time in milliseconds to include"),
    },
    async ({ limit, min_time_ms }) => {
      logger.info("Getting longest running queries", { limit, min_time_ms });
      
      // Modify query based on parameters
      let query = n1qlLongestRunningQueries;
      
      // Apply minimum time filter if specified
      if (min_time_ms && min_time_ms > 0) {
        query = query.replace(
          "LETTING avgServiceTime = AVG(STR_TO_DURATION(serviceTime))",
          `LETTING avgServiceTime = AVG(STR_TO_DURATION(serviceTime))
           HAVING avgServiceTime >= ${min_time_ms}000000` // Convert ms to ns for N1QL
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
        "Longest Running Queries"
      );
    }
  );
};
