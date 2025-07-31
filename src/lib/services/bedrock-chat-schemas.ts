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

// Helper function to sanitize common input mistakes
export function sanitizeToolInput(toolName: string, input: unknown): unknown {
  // Handle bare numbers for query limit tools
  if (typeof input === 'number') {
    const queryTools = [
      'get_most_expensive_queries',
      'get_longest_running_queries',
      'get_most_frequent_queries',
      'get_largest_result_size_queries',
      'get_largest_result_count_queries',
      'get_primary_index_queries',
      'get_completed_requests',
      'get_fatal_requests'
    ];
    
    if (queryTools.includes(toolName)) {
      return { limit: input };
    }
  }
  
  // Handle bare string for node filter
  if (typeof input === 'string' && toolName === 'get_system_vitals') {
    return { node_filter: input };
  }
  
  // Handle bare string for service filter
  if (typeof input === 'string' && toolName === 'get_system_nodes') {
    return { service_filter: input };
  }
  
  // Return input as-is if no sanitization needed
  return input;
}

// Get format hints for tools
export function getFormatHints(toolName: string): string {
  const hints: Record<string, string> = {
    get_system_vitals: 'object with optional node_filter: string',
    get_system_nodes: 'object with optional service_filter: "n1ql" | "kv" | "index" | "fts" | "eventing" | "analytics" | "backup"',
    get_fatal_requests: 'object with optional period: "day" | "week" | "month" | "quarter" and limit: number',
    get_most_expensive_queries: 'object with optional limit: number (1-1000) and period: "day" | "week" | "month"',
    get_longest_running_queries: 'object with optional limit: number (1-1000)',
    get_most_frequent_queries: 'object with optional limit: number (1-1000)',
    get_largest_result_size_queries: 'object with optional limit: number (1-1000)',
    get_largest_result_count_queries: 'object with optional limit: number (1-1000)',
    get_primary_index_queries: 'object with optional limit: number (1-1000)',
    get_system_indexes: 'empty object {}',
    get_completed_requests: 'object with optional limit: number (1-1000)',
    get_prepared_statements: 'empty object {}',
    get_indexes_to_drop: 'empty object {}',
    get_detailed_indexes: 'empty object {}',
    get_detailed_prepared_statements: 'empty object {}',
    get_schema_for_collection: 'object with scope_name: string and collection_name: string',
    run_sql_plus_plus_query: 'object with scope_name: string and query: string',
  };
  
  return hints[toolName] || 'object with appropriate parameters';
}

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

// Enhanced validation function with sanitization and hints
export function validateToolInputWithRetry(toolName: string, input: unknown): { 
  success: true; 
  data: any; 
  wasAutoCorrected?: boolean;
} | { 
  success: false; 
  error: string; 
  sanitizedInput?: unknown;
  hint?: string;
} {
  // First try with sanitized input
  const sanitizedInput = sanitizeToolInput(toolName, input);
  const wasAutoCorrected = sanitizedInput !== input;
  
  const result = validateToolInput(toolName, sanitizedInput);
  
  if (result.success) {
    return {
      ...result,
      wasAutoCorrected
    };
  }
  
  // If validation failed, provide helpful hints
  const hint = getFormatHints(toolName);
  return {
    ...result,
    error: `${result.error}. Expected format: ${hint}`,
    sanitizedInput: wasAutoCorrected ? sanitizedInput : undefined,
    hint
  };
}