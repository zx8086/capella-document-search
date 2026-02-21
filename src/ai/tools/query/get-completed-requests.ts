// src/ai/tools/query/get-completed-requests.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlCompletedRequests } from "../../../tools/queryAnalysis/analysisQueries";
import { createLimitSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  limit: createLimitSchema(5),
});

export const getCompletedRequestsTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_completed_requests";

    try {
      log("[Tool] Executing get_completed_requests", {
        limit: input.limit,
      });

      const cluster = await clusterConn();

      let query = n1qlCompletedRequests;
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

      log("[Tool] Completed requests retrieved", {
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
          summary: `Retrieved ${rows.length} completed query requests with execution plans`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get completed requests failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_completed_requests",
    description:
      "Retrieve detailed history of completed N1QL queries from the last 8 weeks including execution plans and performance metrics. Use this for forensic analysis, debugging specific queries, or understanding historical workload patterns.",
    schema: inputSchema,
  }
);
