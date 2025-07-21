/* src/tools/queryAnalysis/getFatalRequests.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlQueryFatalRequests } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_fatal_requests",
    "Get information about failed/fatal N1QL queries",
    {
      period: z.enum(["day", "week", "month", "quarter"]).optional().describe("Time period to analyze (day, week, month, quarter)"),
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
    },
    async ({ period, limit }) => {
      logger.info("Getting fatal query requests", { period, limit });
      
      // Modify query based on parameters
      let query = n1qlQueryFatalRequests;
      
      // Apply period filter if specified
      if (period) {
        let periodValue: number;
        let periodUnit: string;
        
        switch (period) {
          case "day":
            periodValue = 1;
            periodUnit = "day";
            break;
          case "week":
            periodValue = 1;
            periodUnit = "week";
            break;
          case "month":
            periodValue = 1;
            periodUnit = "month";
            break;
          case "quarter":
            periodValue = 3;
            periodUnit = "month";
            break;
          default:
            periodValue = 1;
            periodUnit = "week";
        }
        
        // Replace the DATE_ADD_STR period in the query
        query = query.replace(
          /DATE_ADD_STR\(NOW_STR\(\), -\d+, '\w+'\)/,
          `DATE_ADD_STR(NOW_STR(), -${periodValue}, '${periodUnit}')`
        );
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        // Add or replace LIMIT clause
        if (query.includes("LIMIT")) {
          query = query.replace(/LIMIT \d+/i, `LIMIT ${limit}`);
        } else {
          // For this specific query, we need to be careful with the UNION
          // Add limit to the end of the query
          query = query.replace(
            "ORDER BY requestTime DESC;",
            `ORDER BY requestTime DESC LIMIT ${limit};`
          );
        }
      }
      
      return executeAnalysisQuery(
        bucket, 
        query,
        "Fatal Query Requests"
      );
    }
  );
};
