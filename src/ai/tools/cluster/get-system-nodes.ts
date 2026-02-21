// src/ai/tools/cluster/get-system-nodes.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { systemNodesQuery } from "../../../tools/queryAnalysis/analysisQueries";
import { createServiceFilterSchema, formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({
  service_filter: createServiceFilterSchema(),
});

export const getSystemNodesTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_system_nodes";

    try {
      log("[Tool] Executing get_system_nodes", {
        service_filter: input.service_filter,
      });

      const cluster = await clusterConn();

      let query = systemNodesQuery;

      if (input.service_filter) {
        query = query.replace(
          "SELECT * FROM system:nodes;",
          `SELECT * FROM system:nodes WHERE ANY s IN services SATISFIES s = "${input.service_filter}" END;`
        );
      }

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      log("[Tool] System nodes retrieved", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        hasServiceFilter: !!input.service_filter,
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          summary: `Retrieved ${rows.length} cluster node(s)${input.service_filter ? ` running ${input.service_filter} service` : ""}`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get system nodes failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_system_nodes",
    description:
      "List all nodes in the Couchbase cluster with their assigned services (n1ql, kv, index, fts), current status, version info, and resource allocation. Use this to understand cluster topology, verify service distribution, or check node availability.",
    schema: inputSchema,
  }
);
