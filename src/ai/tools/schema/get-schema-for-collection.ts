// src/ai/tools/schema/get-schema-for-collection.ts

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { backendConfig } from "$backendConfig";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import {
  createCollectionNameSchema,
  createScopeNameSchema,
  formatToolResult,
  handleNoData,
} from "../helpers";

const inputSchema = z.object({
  scope_name: createScopeNameSchema(),
  collection_name: createCollectionNameSchema(),
});

function formatSchema(doc: Record<string, unknown>): string {
  let formattedText = "Collection Schema:\n\n";

  const formatField = (key: string, value: unknown, indent: number = 0): string => {
    const padding = "  ".repeat(indent);
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    let fieldText = `${padding}${key}: ${type}`;

    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        if (value.length > 0) {
          fieldText += `\n${padding}  Example: ${JSON.stringify(value)}`;
        }
      } else if (Object.keys(value as object).length > 0) {
        fieldText +=
          "\n" +
          Object.entries(value as object)
            .map(([k, v]) => formatField(k, v, indent + 1))
            .join("\n");
      }
    } else if (value !== null) {
      fieldText += ` (Example: ${JSON.stringify(value)})`;
    }
    return fieldText;
  };

  formattedText += Object.entries(doc)
    .map(([key, value]) => formatField(key, value))
    .join("\n");

  return formattedText;
}

export const getSchemaForCollectionTool = tool(
  async (input): Promise<string> => {
    const startTime = Date.now();
    const toolName = "get_schema_for_collection";

    try {
      log("[Tool] Executing get_schema_for_collection", {
        scope_name: input.scope_name,
        collection_name: input.collection_name,
      });

      const cluster = await clusterConn();
      const bucket = cluster.bucket(backendConfig.capella.BUCKET);

      const collectionMgr = bucket.collections();
      const scopes = await collectionMgr.getAllScopes();
      const foundScope = scopes.find((s) => s.name === input.scope_name);

      if (!foundScope) {
        const executionTime = Date.now() - startTime;
        return formatToolResult(
          toolName,
          false,
          { error: `Scope "${input.scope_name}" does not exist` },
          executionTime
        );
      }

      const foundCollection = foundScope.collections.find((c) => c.name === input.collection_name);

      if (!foundCollection) {
        const executionTime = Date.now() - startTime;
        return formatToolResult(
          toolName,
          false,
          {
            error: `Collection "${input.collection_name}" does not exist in scope "${input.scope_name}"`,
          },
          executionTime
        );
      }

      const result = await bucket
        .scope(input.scope_name)
        .query(`SELECT * FROM \`${input.collection_name}\` LIMIT 1`);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        return handleNoData(toolName, input);
      }

      const fieldCount = Object.keys(rows[0]).length;
      const docSize = JSON.stringify(rows[0]).length;

      log("[Tool] Schema inference complete", {
        scope_name: input.scope_name,
        collection_name: input.collection_name,
        fieldCount,
        docSizeBytes: docSize,
        executionTimeMs: executionTime,
      });

      return formatToolResult(
        toolName,
        true,
        {
          schema: formatSchema(rows[0]),
          sampleDocument: rows[0],
          fieldCount,
          docSizeBytes: docSize,
          executionTimeMs: executionTime,
          summary: `Inferred schema with ${fieldCount} fields from collection ${input.scope_name}.${input.collection_name}`,
        },
        executionTime
      );
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);

      if (errorMessage.includes("index")) {
        return formatToolResult(
          toolName,
          false,
          {
            error: "Index failure",
            hint: "Please create a primary index on this collection to enable schema inference. Example: CREATE PRIMARY INDEX ON `bucket`.`scope`.`collection`;",
          },
          executionTime
        );
      }

      err("[Tool] Get schema for collection failed", { error: errorMessage });
      return formatToolResult(toolName, false, { error: errorMessage }, executionTime);
    }
  },
  {
    name: "get_schema_for_collection",
    description:
      "Infer the schema structure of a collection by sampling a document. Returns field names, data types, nested object structures, and example values. Use this to understand data models, plan queries, or verify document structure.",
    schema: inputSchema,
  }
);
