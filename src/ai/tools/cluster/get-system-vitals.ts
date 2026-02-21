// src/ai/tools/cluster/get-system-vitals.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { systemVitalsQuery } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  node_filter: z
    .string()
    .optional()
    .describe(
      "Optional hostname filter to retrieve vitals for specific node(s). Supports partial matching. Examples: 'node1.example.com:8091', 'node1'. If omitted, returns vitals for all cluster nodes."
    ),
});

export const getSystemVitalsTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_system_vitals";

    try {
      log("[Tool] Executing get_system_vitals", {
        node_filter: input.node_filter,
      });

      const cluster = await clusterConn();

      let query = systemVitalsQuery;

      if (input.node_filter) {
        const escapedFilter = input.node_filter.replace(/['"%_\\]/g, "\\$&");
        query = query.replace(
          "SELECT * FROM system:vitals;",
          `SELECT * FROM system:vitals WHERE node LIKE "%${escapedFilter}%";`
        );
      }

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      log("[Tool] System vitals retrieved", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        hasFilter: !!input.node_filter,
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          summary: `Retrieved system vitals for ${rows.length} node(s)`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get system vitals failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_system_vitals",
    description:
      "Retrieve real-time system performance metrics for Couchbase cluster nodes including CPU usage, memory consumption, disk I/O, and network statistics. Use this to diagnose performance issues, monitor resource utilization, or check cluster health.",
    schema: inputSchema,
  }
);
