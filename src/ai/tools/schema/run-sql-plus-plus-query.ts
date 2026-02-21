// src/ai/tools/schema/run-sql-plus-plus-query.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { backendConfig } from "$backendConfig";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import {
  createQuerySchema,
  createScopeNameSchema,
  formatToolResult,
  handleNoData,
} from "../helpers";

const inputSchema = z.object({
  scope_name: createScopeNameSchema(),
  query: createQuerySchema(),
});

export const runSqlPlusPlusQueryTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "run_sql_plus_plus_query";

    try {
      log("[Tool] Executing run_sql_plus_plus_query", {
        scope_name: input.scope_name,
        query: `${input.query.substring(0, 100)}...`,
      });

      const cluster = await clusterConn();
      const bucket = cluster.bucket(backendConfig.capella.BUCKET);

      const queryType = input.query.trim().split(" ")[0].toUpperCase();

      if (/from\s+[`\w]+\.[`\w]+\.[`\w]+/i.test(input.query)) {
        const executionTime = Date.now() - startTime;
        return formatToolResult(
          toolName,
          false,
          {
            error: "Invalid query format",
            hint: "Query uses full bucket.scope.collection path. When using scope context, only use the collection name. Example: SELECT COUNT(*) FROM `_default`",
          },
          executionTime
        );
      }

      const result = await bucket.scope(input.scope_name).query(input.query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;
      const resultSize = JSON.stringify(rows).length;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      log("[Tool] SQL++ query executed", {
        scope_name: input.scope_name,
        queryType,
        rowCount: rows.length,
        resultSizeBytes: resultSize,
        executionTimeMs: executionTime,
      });

      if (rows.length === 1 && "distinct_source_count" in rows[0]) {
        return formatToolResult(
          toolName,
          true,
          {
            rows,
            count: rows.length,
            executionTimeMs: executionTime,
            queryType,
            resultSizeBytes: resultSize,
            summary: `Found ${rows[0].distinct_source_count} distinct sources`,
          },
          executionTime
        );
      }

      return formatToolResult(
        toolName,
        true,
        {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          queryType,
          resultSizeBytes: resultSize,
          query: input.query,
          scope: input.scope_name,
          summary: `Query returned ${rows.length} result(s) in ${executionTime}ms`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);
      err("[Tool] Run SQL++ query failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "run_sql_plus_plus_query",
    description:
      "Execute custom SQL++ (N1QL) queries within a specific scope context. Supports SELECT, UPDATE, DELETE operations. When using scope context, reference collections directly by name (e.g., FROM `collection` not FROM `bucket`.`scope`.`collection`).",
    schema: inputSchema,
  }
);
