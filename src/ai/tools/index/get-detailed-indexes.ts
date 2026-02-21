// src/ai/tools/index/get-detailed-indexes.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { detailedIndexesQuery } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({});

const MAX_INDEXES_TO_SHOW = 15;

function generateDetailedSummary(rows: any[]): Record<string, unknown> {
  const indexesByBucket: Record<string, number> = {};
  const indexesByType: Record<string, number> = {};
  let totalStorageSize = 0;

  rows.forEach((row: any) => {
    const bucket = row.bucket || row.bucket_id || "unknown";
    indexesByBucket[bucket] = (indexesByBucket[bucket] || 0) + 1;

    const indexType = row.using || "gsi";
    indexesByType[indexType] = (indexesByType[indexType] || 0) + 1;

    if (row.storageSize) {
      totalStorageSize += parseInt(row.storageSize, 10) || 0;
    }
  });

  const topBuckets = Object.entries(indexesByBucket)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return {
    totalIndexes: rows.length,
    totalStorageGB: (totalStorageSize / 1024 / 1024 / 1024).toFixed(2),
    byType: indexesByType,
    topBuckets: Object.fromEntries(topBuckets),
  };
}

export const getDetailedIndexesTool = tool(
  async (): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_detailed_indexes";

    try {
      log("[Tool] Executing get_detailed_indexes");

      const cluster = await clusterConn();

      const result = await cluster.query(detailedIndexesQuery);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, {});
      }

      const summary = generateDetailedSummary(rows);
      const limitedRows = rows.slice(0, MAX_INDEXES_TO_SHOW);

      log("[Tool] Detailed indexes retrieved", {
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
          summary: `Retrieved detailed info for ${rows.length} indexes (showing ${limitedRows.length})`,
          statistics: summary,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get detailed indexes failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_detailed_indexes",
    description:
      "Retrieve comprehensive metadata for all indexes including creation statements, index keys, partition info, build status, and storage statistics. More detailed than get_system_indexes. Use for deep index analysis, troubleshooting, or capacity planning.",
    schema: inputSchema,
  }
);
