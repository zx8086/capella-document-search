// src/ai/tools/query/get-longest-running-queries.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlLongestRunningQueries } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
});

export const getLongestRunningQueriesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_longest_running_queries";

    try {
      log("[Tool] Executing get_longest_running_queries", {
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlLongestRunningQueries;
      const appliedFilters: string[] = [];

      const effectiveLimit = input.limit ?? 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      log("[Tool] Longest running queries retrieved", {
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
          summary: `Found ${rows.length} slow queries ranked by average service time`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get longest running queries failed", {
        error: errorMessage,
      });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_longest_running_queries",
    description:
      "Find N1QL queries with the highest average execution times regardless of frequency. Use this to identify slow queries that need optimization, missing indexes, or query plan improvements.",
    schema: inputSchema,
  }
);
