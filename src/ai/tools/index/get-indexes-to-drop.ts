// src/ai/tools/index/get-indexes-to-drop.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlIndexesToDrop } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({});

export const getIndexesToDropTool = tool(
  async (): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_indexes_to_drop";

    try {
      log("[Tool] Executing get_indexes_to_drop");

      const cluster = await clusterConn();

      const result = await cluster.query(n1qlIndexesToDrop);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, {});
      }

      log("[Tool] Indexes to drop analysis complete", {
        candidateCount: rows.length,
        executionTimeMs: executionTime,
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          summary: `Found ${rows.length} index(es) that may be candidates for removal`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get indexes to drop failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_indexes_to_drop",
    description:
      "Analyze index usage to identify candidates for removal including unused indexes, duplicate indexes, or indexes with overlapping coverage. Use this for index optimization and storage reduction.",
    schema: inputSchema,
  }
);
