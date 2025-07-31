import { z } from 'zod';

// Common schemas
const LimitSchema = z.number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .default(5)
  .describe('Maximum number of results to return (1-1000). Higher limits may impact response time.');

const PeriodSchema = z.enum(['day', 'week', 'month', 'quarter'])
  .optional()
  .describe('Time period to analyze. Day=24h, Week=7d, Month=30d, Quarter=90d');

const ServiceFilterSchema = z.enum(['n1ql', 'kv', 'index', 'fts', 'eventing', 'analytics', 'backup'])
  .optional()
  .describe('Couchbase service type to filter by');

// Tool-specific input schemas
export const SystemVitalsInputSchema = z.object({
  node_filter: z.string()
    .optional()
    .describe('Filter by node hostname (e.g., "node1.example.com:8091"). Supports partial matching.')
});

export const SystemNodesInputSchema = z.object({
  service_filter: ServiceFilterSchema
});

export const FatalRequestsInputSchema = z.object({
  period: PeriodSchema.default('week'),
  limit: LimitSchema
});

export const MostExpensiveQueriesInputSchema = z.object({
  limit: LimitSchema,
  period: z.enum(['day', 'week', 'month']).optional()
});

export const LongestRunningQueriesInputSchema = z.object({
  limit: LimitSchema
});

export const MostFrequentQueriesInputSchema = z.object({
  limit: LimitSchema
});

export const LargestResultSizeQueriesInputSchema = z.object({
  limit: LimitSchema
});

export const LargestResultCountQueriesInputSchema = z.object({
  limit: LimitSchema
});

export const PrimaryIndexQueriesInputSchema = z.object({
  limit: LimitSchema
});

export const SystemIndexesInputSchema = z.object({});

export const CompletedRequestsInputSchema = z.object({
  limit: LimitSchema
});

export const PreparedStatementsInputSchema = z.object({});

export const IndexesToDropInputSchema = z.object({});

export const DetailedIndexesInputSchema = z.object({});

export const DetailedPreparedStatementsInputSchema = z.object({});

export const SchemaForCollectionInputSchema = z.object({
  scope_name: z.string()
    .min(1)
    .max(251)
    .regex(/^[a-zA-Z0-9_%-]+$/, 'Scope name must contain only alphanumeric characters, underscores, hyphens, or percent signs')
    .describe('Name of the scope containing the collection'),
  collection_name: z.string()
    .min(1)
    .max(251)
    .regex(/^[a-zA-Z0-9_%-]+$/, 'Collection name must contain only alphanumeric characters, underscores, hyphens, or percent signs')
    .describe('Name of the collection to analyze')
});

export const RunSqlPlusPlusQueryInputSchema = z.object({
  scope_name: z.string()
    .min(1)
    .max(251)
    .regex(/^[a-zA-Z0-9_%-]+$/, 'Scope name must contain only alphanumeric characters, underscores, hyphens, or percent signs')
    .describe('Name of the scope to execute the query in'),
  query: z.string()
    .min(1)
    .max(65536)
    .describe('SQL++ query to execute. Use only collection names in FROM clause when using scope context.')
});

// Map tool names to their schemas
export const toolInputSchemas = {
  get_system_vitals: SystemVitalsInputSchema,
  get_system_nodes: SystemNodesInputSchema,
  get_fatal_requests: FatalRequestsInputSchema,
  get_most_expensive_queries: MostExpensiveQueriesInputSchema,
  get_longest_running_queries: LongestRunningQueriesInputSchema,
  get_most_frequent_queries: MostFrequentQueriesInputSchema,
  get_largest_result_size_queries: LargestResultSizeQueriesInputSchema,
  get_largest_result_count_queries: LargestResultCountQueriesInputSchema,
  get_primary_index_queries: PrimaryIndexQueriesInputSchema,
  get_system_indexes: SystemIndexesInputSchema,
  get_completed_requests: CompletedRequestsInputSchema,
  get_prepared_statements: PreparedStatementsInputSchema,
  get_indexes_to_drop: IndexesToDropInputSchema,
  get_detailed_indexes: DetailedIndexesInputSchema,
  get_detailed_prepared_statements: DetailedPreparedStatementsInputSchema,
  get_schema_for_collection: SchemaForCollectionInputSchema,
  run_sql_plus_plus_query: RunSqlPlusPlusQueryInputSchema,
} as const;

// Type for tool names
export type ToolName = keyof typeof toolInputSchemas;

// Helper function to validate tool input
export function validateToolInput(toolName: string, input: unknown): { success: true; data: any } | { success: false; error: string } {
  const schema = toolInputSchemas[toolName as ToolName];
  
  if (!schema) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    };
  }
  
  try {
    const validatedData = schema.parse(input);
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return {
        success: false,
        error: `Validation failed: ${errorMessages}`
      };
    }
    return {
      success: false,
      error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}