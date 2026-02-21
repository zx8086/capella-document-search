// src/ai/tools/helpers/shared-schemas.ts

import { z } from "zod";

// Reusable schema factories for tool input validation

export const createLimitSchema = (defaultValue = 5) =>
  z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(defaultValue)
    .describe(
      "Maximum number of results to return (1-1000). Higher limits may impact response time."
    );

export const createPeriodSchema = () =>
  z
    .enum(["day", "week", "month", "quarter"])
    .optional()
    .describe("Time period to analyze. Day=24h, Week=7d, Month=30d, Quarter=90d");

export const createServiceFilterSchema = () =>
  z
    .enum(["n1ql", "kv", "index", "fts", "eventing", "analytics", "backup"])
    .optional()
    .describe("Couchbase service type to filter by");

export const createNodeFilterSchema = () =>
  z
    .string()
    .optional()
    .describe(
      "Filter by node hostname (e.g., 'node1.example.com:8091'). Supports partial matching."
    );

export const createScopeNameSchema = () =>
  z
    .string()
    .min(1)
    .max(251)
    .regex(
      /^[a-zA-Z0-9_%-]+$/,
      "Scope name must contain only alphanumeric characters, underscores, hyphens, or percent signs"
    )
    .describe("Name of the scope containing the collection");

export const createCollectionNameSchema = () =>
  z
    .string()
    .min(1)
    .max(251)
    .regex(
      /^[a-zA-Z0-9_%-]+$/,
      "Collection name must contain only alphanumeric characters, underscores, hyphens, or percent signs"
    )
    .describe("Name of the collection to analyze");

export const createQuerySchema = () =>
  z
    .string()
    .min(1)
    .max(65536)
    .describe(
      "SQL++ query to execute. Use only collection names in FROM clause when using scope context."
    );

// Helper function to sanitize common input mistakes
export function sanitizeToolInput(toolName: string, input: unknown): unknown {
  // Handle bare numbers for query limit tools
  if (typeof input === "number") {
    const queryTools = [
      "get_most_expensive_queries",
      "get_longest_running_queries",
      "get_most_frequent_queries",
      "get_largest_result_size_queries",
      "get_largest_result_count_queries",
      "get_primary_index_queries",
      "get_completed_requests",
      "get_fatal_requests",
    ];

    if (queryTools.includes(toolName)) {
      return { limit: input };
    }
  }

  // Handle bare string for node filter
  if (typeof input === "string" && toolName === "get_system_vitals") {
    return { node_filter: input };
  }

  // Handle bare string for service filter
  if (typeof input === "string" && toolName === "get_system_nodes") {
    return { service_filter: input };
  }

  return input;
}

// Get format hints for tools (useful for error messages)
export function getFormatHints(toolName: string): string {
  const hints: Record<string, string> = {
    get_system_vitals: "object with optional node_filter: string",
    get_system_nodes:
      'object with optional service_filter: "n1ql" | "kv" | "index" | "fts" | "eventing" | "analytics" | "backup"',
    get_fatal_requests:
      'object with optional period: "day" | "week" | "month" | "quarter" and limit: number',
    get_most_expensive_queries:
      'object with optional limit: number (1-1000) and period: "day" | "week" | "month"',
    get_longest_running_queries: "object with optional limit: number (1-1000)",
    get_most_frequent_queries: "object with optional limit: number (1-1000)",
    get_largest_result_size_queries: "object with optional limit: number (1-1000)",
    get_largest_result_count_queries: "object with optional limit: number (1-1000)",
    get_primary_index_queries: "object with optional limit: number (1-1000)",
    get_system_indexes: "empty object {}",
    get_completed_requests: "object with optional limit: number (1-1000)",
    get_prepared_statements: "empty object {}",
    get_indexes_to_drop: "empty object {}",
    get_detailed_indexes: "empty object {}",
    get_detailed_prepared_statements: "empty object {}",
    get_schema_for_collection: "object with scope_name: string and collection_name: string",
    run_sql_plus_plus_query: "object with scope_name: string and query: string",
  };

  return hints[toolName] || "object with appropriate parameters";
}
