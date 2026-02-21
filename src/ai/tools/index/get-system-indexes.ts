// src/ai/tools/index/get-system-indexes.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlSystemIndexes } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({});

const MAX_INDEXES_TO_SHOW = 20;

function generateIndexSummary(rows: any[]): Record<string, unknown> {
  const indexesByKeyspace: Record<string, number> = {};
  const indexesByType: Record<string, number> = { primary: 0, secondary: 0, array: 0 };
  const indexesByState: Record<string, number> = { online: 0, building: 0, deferred: 0 };

  rows.forEach((row: any) => {
    const keyspace = `${row.bucket_id || "unknown"}.${row.scope_id || "_default"}.${row.keyspace_id || "_default"}`;
    indexesByKeyspace[keyspace] = (indexesByKeyspace[keyspace] || 0) + 1;

    if (row.is_primary) indexesByType.primary++;
    else if (row.index_key?.includes("ARRAY")) indexesByType.array++;
    else indexesByType.secondary++;

    const state = row.state?.toLowerCase() || "unknown";
    if (state in indexesByState) {
      indexesByState[state]++;
    }
  });

  const topKeyspaces = Object.entries(indexesByKeyspace)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return {
    totalIndexes: rows.length,
    byType: indexesByType,
    byState: indexesByState,
    topKeyspaces: Object.fromEntries(topKeyspaces),
  };
}

export const getSystemIndexesTool = tool(
  async (): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_system_indexes";

    try {
      log("[Tool] Executing get_system_indexes");

      const cluster = await clusterConn();

      const result = await cluster.query(n1qlSystemIndexes);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, {});
      }

      const summary = generateIndexSummary(rows);
      const limitedRows = rows.slice(0, MAX_INDEXES_TO_SHOW);

      log("[Tool] System indexes retrieved", {
        totalIndexes: rows.length,
        returnedIndexes: limitedRows.length,
        executionTimeMs: executionTime,
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows: limitedRows,
          totalCount: rows.length,
          limited: rows.length > MAX_INDEXES_TO_SHOW,
          executionTimeMs: executionTime,
          summary: `Found ${rows.length} indexes (showing ${limitedRows.length})`,
          statistics: summary,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get system indexes failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_system_indexes",
    description:
      "List all indexes across all buckets and scopes in the cluster. Use this to audit existing indexes, check index distribution, or identify duplicate/redundant indexes.",
    schema: inputSchema,
  }
);
