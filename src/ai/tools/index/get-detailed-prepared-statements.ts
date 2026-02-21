// src/ai/tools/index/get-detailed-prepared-statements.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { detailedPreparedStatementsQuery } from "../../../tools/queryAnalysis/analysisQueries";
import { formatToolResult, handleNoData } from "../helpers";

const inputSchema = z.object({});

const MAX_STATEMENTS_TO_SHOW = 10;

function generateDetailedSummary(rows: any[]): Record<string, unknown> {
  const statementsByNode: Record<string, number> = {};
  const recentStatements: { name: string; lastUse: string; uses: number }[] = [];

  rows.forEach((row: any) => {
    const node = row.node || "unknown";
    statementsByNode[node] = (statementsByNode[node] || 0) + 1;

    if (row.lastUse && recentStatements.length < 5) {
      recentStatements.push({
        name: row.name || "unnamed",
        lastUse: row.lastUse,
        uses: row.uses || 0,
      });
    }
  });

  return {
    totalStatements: rows.length,
    byNode: statementsByNode,
    mostRecentlyUsed: recentStatements,
  };
}

export const getDetailedPreparedStatementsTool = tool(
  async (): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_detailed_prepared_statements";

    try {
      log("[Tool] Executing get_detailed_prepared_statements");

      const cluster = await clusterConn();

      const result = await cluster.query(detailedPreparedStatementsQuery);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, {});
      }

      const summary = generateDetailedSummary(rows);
      const limitedRows = rows.slice(0, MAX_STATEMENTS_TO_SHOW);

      log("[Tool] Detailed prepared statements retrieved", {
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
          summary: `Retrieved detailed info for ${rows.length} prepared statements (showing ${limitedRows.length})`,
          statistics: summary,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Get detailed prepared statements failed", {
        error: errorMessage,
      });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_detailed_prepared_statements",
    description:
      "Access extended information about prepared statements including execution counts, average execution times, last use timestamps, and encoded plans. More comprehensive than get_prepared_statements. Use for performance analysis and prepared statement optimization.",
    schema: inputSchema,
  }
);
