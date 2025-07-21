/* src/tools/getSchemaForCollection.ts */

import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../lib/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface SchemaParams {
    scope_name: string;
    collection_name: string;
}

interface SchemaResponse {
    content: Array<{
        type: "text";
        text: string;
    }>;
}

interface Document {
    [key: string]: unknown;
}

const formatSchema = (doc: Document): string => {
    let formattedText = "📋 Collection Schema:\n\n";

    const formatField = (key: string, value: unknown, indent: number = 0): string => {
        const padding = "  ".repeat(indent);
        const type =
            value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

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
};

const getSchemaHandler = async (params: SchemaParams, bucket: Bucket): Promise<SchemaResponse> => {
    const { scope_name, collection_name } = params;
    logger.info(
        `getSchemaHandler called with scope_name=${scope_name}, collection_name=${collection_name}`,
    );

    const collectionMgr = bucket.collections();
    const scopes = await collectionMgr.getAllScopes();
    const foundScope = scopes.find((s) => s.name === scope_name);
    if (!foundScope) {
        throw new Error(`Scope "${scope_name}" does not exist`);
    }
    const foundCollection = foundScope.collections.find(
        (c) => c.name === collection_name,
    );
    if (!foundCollection) {
        throw new Error(
            `Collection "${collection_name}" does not exist in scope "${scope_name}"`,
        );
    }

    try {
        const result = await bucket
            .scope(scope_name)
            .query("SELECT * FROM `" + collection_name + "` LIMIT 1");
        const rows = await result.rows;

        if (rows.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "❌ No documents found in collection to infer schema",
                    },
                ],
            };
        }

        return {
            content: [
                {
                    type: "text" as const,
                    text: formatSchema(rows[0] as Document),
                },
            ],
        };
    } catch (err: unknown) {
        if (
            err instanceof Error &&
            err.message.includes("index")
        ) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "❌ Database error: index failure. Please create a primary index on this collection to enable schema inference. Example:\n\nCREATE PRIMARY INDEX ON `bucket`.`scope`.`collection`;",
                    },
                ],
            };
        }
        throw err;
    }
};

export default (server: McpServer, bucket: Bucket) => {
    server.tool(
        "get_schema_for_collection",
        "Get the schema for a collection by sampling a document",
        {
            scope_name: z.string().describe("Name of the scope"),
            collection_name: z.string().describe("Name of the collection"),
        },
        async (params: SchemaParams) => {
            return getSchemaHandler(params, bucket);
        },
    );
};
