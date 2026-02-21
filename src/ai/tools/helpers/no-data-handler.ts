// src/ai/tools/helpers/no-data-handler.ts

export interface NoDataResponse {
  status: "no_data";
  message: string;
  suggestions: string[];
  toolName: string;
  input: Record<string, unknown>;
}

export function handleNoData(toolName: string, input: Record<string, unknown>): string {
  const context: string[] = [];

  // Build context from input parameters
  if (input.node_filter) context.push(`node "${input.node_filter}"`);
  if (input.service_filter) context.push(`service "${input.service_filter}"`);
  if (input.period) context.push(`period "${input.period}"`);
  if (input.scope_name) context.push(`scope "${input.scope_name}"`);
  if (input.collection_name) context.push(`collection "${input.collection_name}"`);
  if (input.limit) context.push(`limit ${input.limit}`);

  const contextStr = context.length > 0 ? ` (${context.join(", ")})` : "";

  const response: NoDataResponse = {
    status: "no_data",
    message: `No data found for ${toolName}${contextStr}`,
    suggestions: getSuggestions(toolName),
    toolName,
    input,
  };

  return JSON.stringify(response);
}

function getSuggestions(toolName: string): string[] {
  const commonSuggestions = [
    "Try a broader time range",
    "Verify the cluster is running and accessible",
  ];

  const toolSpecificSuggestions: Record<string, string[]> = {
    get_system_vitals: ["Check if the node hostname is correct", "Verify cluster connectivity"],
    get_system_nodes: ["Verify the service is enabled on the cluster", "Check cluster health"],
    get_fatal_requests: [
      "No failed queries may indicate healthy operation",
      "Try extending the time period",
    ],
    get_most_expensive_queries: [
      "No expensive queries found - this may be normal",
      "Check if query service is active",
    ],
    get_longest_running_queries: [
      "No slow queries detected",
      "Consider checking completed_requests for historical data",
    ],
    get_schema_for_collection: [
      "Verify the scope and collection names are correct",
      "Check if the collection contains documents",
    ],
    run_sql_plus_plus_query: [
      "Verify the query syntax",
      "Check if the scope exists",
      "Ensure collection names are correct",
    ],
    get_system_indexes: ["Verify index service is running", "Check bucket/scope configuration"],
    get_indexes_to_drop: [
      "No unused indexes found - indexes are being utilized",
      "Review index usage patterns manually",
    ],
  };

  return [...commonSuggestions, ...(toolSpecificSuggestions[toolName] || [])];
}

// Format tool result for consistent output
export function formatToolResult(
  toolName: string,
  success: boolean,
  data: unknown,
  executionTimeMs: number
): string {
  const result = {
    success,
    toolName,
    executionTimeMs,
    data,
  };

  return JSON.stringify(result);
}
