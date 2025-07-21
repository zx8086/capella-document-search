/* src/tools/queryAnalysis/getMostExpensiveQueries.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { mostExpensiveQueries } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_most_expensive_queries",
    "Get the most expensive queries based on execution time and resource usage",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      period: z.enum(["day", "week", "month"]).optional().describe("Optional period to analyze (day, week, month)"),
    },
    async ({ limit, period }) => {
      logger.info("Getting most expensive queries", { limit, period });
      
      // Modify query based on parameters
      let query = mostExpensiveQueries;
      
      // Apply period filter if specified
      if (period) {
        let periodClause: string;
        switch (period) {
          case "day":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'day')";
            break;
          case "week":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
            break;
          case "month":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'month')";
            break;
          default:
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
        }
        
        // Replace WHERE clause to include period
        query = query.replace(
          "WHERE LOWER(statement)",
          `WHERE ${periodClause} AND LOWER(statement)`
        );
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        // Add or replace LIMIT clause
        if (/LIMIT \d+/i.test(query)) {
          query = query.replace(/LIMIT \d+/i, `LIMIT ${limit}`);
        } else {
          query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
        }
      }

      // Log the final query for debugging
      logger.error('Final N1QL Query:\n' + query);

      return executeAnalysisQuery(
        bucket, 
        query, 
        "Most Expensive Queries"
      );
    }
  );
};
