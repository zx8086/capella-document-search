// src/ai/tools/query/get-most-expensive-queries.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { mostExpensiveQueries } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
  period: z
    .enum(["day", "week", "month"])
    .optional()
    .describe(
      "Time window for analysis. 'day' = last 24 hours, 'week' = last 7 days, 'month' = last 30 days."
    ),
});

export const getMostExpensiveQueriesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_most_expensive_queries";

    try {
      log("[Tool] Executing get_most_expensive_queries", {
        limit: input.limit,
        period: input.period,
      });

      const cluster = await clusterConn();

      let query = mostExpensiveQueries;
      const appliedFilters: string[] = [];

      if (input.period) {
        appliedFilters.push(`period: ${input.period}`);
        let periodClause: string;
        switch (input.period) {
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
        query = query.replace(
          "WHERE LOWER(statement)",
          `WHERE ${periodClause} AND LOWER(statement)`
        );
      }

      const effectiveLimit = input.limit ?? 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      const totalCost = rows.reduce(
        (sum: number, row: { totalElapsedTime?: number }) => sum + (row.totalElapsedTime || 0),
        0
      );

      log("[Tool] Most expensive queries retrieved", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        totalCostMs: totalCost,
        appliedFilters: appliedFilters.join(", "),
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          totalCostMs: totalCost,
          appliedFilters,
          summary: `Found ${rows.length} expensive queries with total cost of ${totalCost}ms`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get most expensive queries failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_most_expensive_queries",
    description:
      "Identify resource-intensive N1QL queries ranked by total execution time (serviceTime x frequency). Use this to find queries consuming the most cluster resources for optimization. Excludes system queries, INFER, and CREATE INDEX statements.",
    schema: inputSchema,
  }
);
