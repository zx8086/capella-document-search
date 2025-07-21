/* src/tools/queryAnalysis/getCompletedRequests.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlCompletedRequests } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_completed_requests",
    "Get recent completed query requests with detailed execution information",
    {
      limit: z.number().optional().describe("Optional limit for the number of results to return"),
      period: z.enum(["day", "week", "month", "quarter"]).optional().describe("Time period to analyze (day, week, month, quarter)"),
      status: z.enum(["success", "fatal", "timeout", "all"]).optional().describe("Filter by request status"),
    },
    async ({ limit, period, status }) => {
      logger.info("Getting completed requests", { limit, period, status });
      
      // Modify query based on parameters
      let query = n1qlCompletedRequests;
      
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
      
      // Apply status filter if specified
      if (status && status !== "all") {
        if (query.includes("WHERE")) {
          query = query.replace(
            /WHERE/,
            `WHERE state = '${status}' AND`
          );
        } else {
          query = query.replace(
            /ORDER BY/,
            `WHERE state = '${status}' ORDER BY`
          );
        }
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
        "Completed Query Requests"
      );
    }
  );
};
