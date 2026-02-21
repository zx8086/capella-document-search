// src/ai/tools/query/get-fatal-requests.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlQueryFatalRequests } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, createPeriodSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  period: createPeriodSchema(),
  limit: createLimitSchema(5),
});

export const getFatalRequestsTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_fatal_requests";

    try {
      log("[Tool] Executing get_fatal_requests", {
        period: input.period,
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlQueryFatalRequests;
      const appliedFilters: string[] = [];

      if (input.period) {
        let periodValue: number;
        let periodUnit: string;

        switch (input.period) {
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

        appliedFilters.push(`period: ${input.period}`);

        query = query.replace(
          /DATE_ADD_STR\(NOW_STR\(\), -\d+, '\w+'\)/,
          `DATE_ADD_STR(NOW_STR(), -${periodValue}, '${periodUnit}')`
        );
      }

      const effectiveLimit = input.limit ?? 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(
        "ORDER BY requestTime DESC;",
        `ORDER BY requestTime DESC LIMIT ${effectiveLimit};`
      );

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      log("[Tool] Fatal requests retrieved", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        appliedFilters: appliedFilters.join(", "),
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
          summary: `Found ${rows.length} fatal query request(s)`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get fatal requests failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_fatal_requests",
    description:
      "Analyze failed N1QL queries including timeouts (>1000ms), errors, and fatal exceptions. Essential for troubleshooting query failures, identifying problematic patterns, and debugging application issues. Returns error details, stack traces, and query text.",
    schema: inputSchema,
  }
);
