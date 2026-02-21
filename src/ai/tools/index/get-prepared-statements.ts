// src/ai/tools/index/get-prepared-statements.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { n1qlPreparedStatements } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({});

const MAX_STATEMENTS_TO_SHOW = 20;

function generatePreparedSummary(rows: any[]): Record<string, unknown> {
  const byStatus: Record<string, number> = {};

  rows.forEach((row: any) => {
    const status = row.state || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
  });

  return {
    totalStatements: rows.length,
    byStatus,
  };
}

export const getPreparedStatementsTool = tool(
  async (): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_prepared_statements";

    try {
      log("[Tool] Executing get_prepared_statements");

      const cluster = await clusterConn();

      const result = await cluster.query(n1qlPreparedStatements);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, {});
      }

      const summary = generatePreparedSummary(rows);
      const limitedRows = rows.slice(0, MAX_STATEMENTS_TO_SHOW);

      log("[Tool] Prepared statements retrieved", {
        totalStatements: rows.length,
        returnedStatements: limitedRows.length,
        executionTimeMs: executionTime,
      });

      return formatToolResult(
        toolName,
        true,
        {
          rows: limitedRows,
          totalCount: rows.length,
          limited: rows.length > MAX_STATEMENTS_TO_SHOW,
          executionTimeMs: executionTime,
          summary: `Found ${rows.length} prepared statements (showing ${limitedRows.length})`,
          statistics: summary,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get prepared statements failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_prepared_statements",
    description:
      "Show all cached prepared statements in the query service. Use this to monitor prepared statement usage, verify statement caching, or identify stale prepared statements.",
    schema: inputSchema,
  }
);
