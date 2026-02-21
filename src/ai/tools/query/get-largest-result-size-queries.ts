// src/ai/tools/query/get-largest-result-size-queries.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlLargestResultSizeQueries } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
});

export const getLargestResultSizeQueriesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_largest_result_size_queries";

    try {
      log("[Tool] Executing get_largest_result_size_queries", {
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlLargestResultSizeQueries;
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

      log("[Tool] Largest result size queries retrieved", {
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
          summary: `Found ${rows.length} queries ranked by average result size (bytes)`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get largest result size queries failed", {
        error: errorMessage,
      });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_largest_result_size_queries",
    description:
      "Find N1QL queries returning the largest data volumes (in bytes). Use this to identify queries that may cause memory pressure, network congestion, or client-side performance issues.",
    schema: inputSchema,
  }
);
