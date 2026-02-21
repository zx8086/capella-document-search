// src/ai/tools/query/get-most-frequent-queries.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlMostFrequentQueries } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
});

export const getMostFrequentQueriesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_most_frequent_queries";

    try {
      log("[Tool] Executing get_most_frequent_queries", {
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlMostFrequentQueries;
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

      log("[Tool] Most frequent queries retrieved", {
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
          summary: `Found ${rows.length} queries ranked by execution frequency`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get most frequent queries failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_most_frequent_queries",
    description:
      "Discover the most frequently executed N1QL queries sorted by execution count. Use this to identify hot queries for caching opportunities, prepared statement candidates, or workload patterns.",
    schema: inputSchema,
  }
);
