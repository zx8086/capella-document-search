// src/ai/tools/query/get-largest-result-count-queries.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlLargestResultCountQueries } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
});

export const getLargestResultCountQueriesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_largest_result_count_queries";

    try {
      log("[Tool] Executing get_largest_result_count_queries", {
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlLargestResultCountQueries;
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

      log("[Tool] Largest result count queries retrieved", {
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
          summary: `Found ${rows.length} queries ranked by average result count`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get largest result count queries failed", {
        error: errorMessage,
      });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_largest_result_count_queries",
    description:
      "Identify N1QL queries returning the highest number of documents. Use this to find queries that may benefit from LIMIT clauses, pagination, or more selective WHERE conditions.",
    schema: inputSchema,
  }
);
