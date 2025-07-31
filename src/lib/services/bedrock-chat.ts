/* src/lib/services/bedrock-chat.ts */

// This service handles Bedrock chat completions with comprehensive tool execution support
// Key features:
// - Zod validation for all tool inputs
// - Stop reason tracking for debugging and monitoring
// - Recursion depth tracking to prevent infinite loops
// - Tool execution guidance with mandatory post-execution analysis
// - LangSmith integration with detailed metadata

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ConverseCommand,
  type Tool,
  type ToolConfiguration,
  type Message,
  type ContentBlock,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { log, err } from "$utils/unifiedLogger";
import {
  systemVitalsQuery,
  systemNodesQuery,
  n1qlQueryFatalRequests,
  mostExpensiveQueries,
  n1qlLongestRunningQueries,
  n1qlMostFrequentQueries,
  n1qlLargestResultSizeQueries,
  n1qlLargestResultCountQueries,
  n1qlPrimaryIndexes,
  n1qlSystemIndexes,
  n1qlCompletedRequests,
  n1qlPreparedStatements,
  n1qlIndexesToDrop,
  detailedPreparedStatementsQuery,
  detailedIndexesQuery,
} from "../../tools/queryAnalysis/analysisQueries";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../backend-config";
import { traceable } from "langsmith/traceable";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { RunTree } from "langsmith/run_trees";
import { validateToolInput, validateToolInputWithRetry, sanitizeToolInput } from "./bedrock-chat-schemas";
// import { usageTracker } from "./usage-tracking"; // Removed - using LangSmith only

// Token usage interface for type safety
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  timestamp: string;
  estimatedCost?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// Tool execution result interface
interface ToolExecutionResult {
  success: boolean;
  content: string;
  error?: string;
  data?: {
    rows?: any[];
    count?: number;
    executionTimeMs?: number;
    [key: string]: any;
  };
}

// Cost calculation based on model type
const MODEL_PRICING: { [key: string]: { inputTokensPerThousand: number; outputTokensPerThousand: number } } = {
  // Amazon Nova Pro (eu-central-1 pricing)
  "eu.amazon.nova-pro-v1:0": {
    inputTokensPerThousand: 0.0008, // $0.80 per 1M input tokens
    outputTokensPerThousand: 0.0032, // $3.20 per 1M output tokens
  },
  // Claude 3.5 Sonnet (eu-central-1 pricing)
  "anthropic.claude-3-5-sonnet-20241022-v2:0": {
    inputTokensPerThousand: 0.003, // $3.00 per 1M input tokens
    outputTokensPerThousand: 0.015, // $15.00 per 1M output tokens
  },
  // Claude 3.7 Sonnet (eu-central-1 pricing) 
  "eu.anthropic.claude-3-7-sonnet-20250219-v1:0": {
    inputTokensPerThousand: 0.003, // $3.00 per 1M input tokens
    outputTokensPerThousand: 0.015, // $15.00 per 1M output tokens
  },
  // Add fallback for older Claude models
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    inputTokensPerThousand: 0.003,
    outputTokensPerThousand: 0.015,
  }
};

function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model] || MODEL_PRICING["eu.amazon.nova-pro-v1:0"]; // Fallback to Nova pricing
  const inputCost = (usage.inputTokens / 1000) * pricing.inputTokensPerThousand;
  const outputCost = (usage.outputTokens / 1000) * pricing.outputTokensPerThousand;
  return inputCost + outputCost;
}

// Tool execution verifier to catch hallucinated tool results
class ToolExecutionVerifier {
  private static readonly FAKE_TOOL_PATTERNS = [
    /### Tool:\s*\w+/i,
    /```json\s*{\s*"[^"]+"/i, // JSON blocks after tool mentions
    /\[Tool called:\s*\w+\]/i,
    /I'll check for.*?\n.*?```json/is,
  ];

  static detectFakeToolExecution(
    responseText: string, 
    actualStopReason: string
  ): boolean {
    // If stop reason isn't tool_use but response contains tool patterns
    if (actualStopReason !== "tool_use") {
      return this.FAKE_TOOL_PATTERNS.some(pattern => 
        pattern.test(responseText)
      );
    }
    return false;
  }

  static createVerificationError(responseText: string): string {
    return `
❌ CRITICAL ERROR: Tool execution was simulated instead of actually performed.

The response contains tool result patterns but no actual tool was executed.
This indicates the LLM hallucinated results instead of using function calling.

Response preview: ${responseText.substring(0, 200)}...

REQUIRED ACTION: The system must execute actual tools to retrieve real data.
`;
  }
  
  static createUserFriendlyMessage(): string {
    return "I apologize, but I'm having trouble accessing the tools needed to answer your question. Please try rephrasing your request or asking a different question.";
  }
}

const getSystemVitalsTool: Tool = {
  toolSpec: {
    name: "get_system_vitals",
    description:
      "Retrieve real-time system performance metrics for Couchbase cluster nodes including CPU usage, memory consumption, disk I/O, and network statistics. Use this to diagnose performance issues, monitor resource utilization, or check cluster health. Returns detailed metrics for all nodes or filtered by specific node hostname.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          node_filter: {
            type: "string",
            description:
              "Optional hostname filter to retrieve vitals for specific node(s). Supports partial matching. Examples: 'node1.example.com:8091', 'node1', 'example.com'. If omitted, returns vitals for all cluster nodes. Case-insensitive.",
          },
        },
        required: [],
      },
    },
  },
};

const getSystemNodesTool: Tool = {
  toolSpec: {
    name: "get_system_nodes",
    description:
      "List all nodes in the Couchbase cluster with their assigned services (n1ql, kv, index, fts), current status, version info, and resource allocation. Use this to understand cluster topology, verify service distribution, or check node availability. Can filter by specific service type.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          service_filter: {
            type: "string",
            description:
              "Optional filter by Couchbase service type. Valid values: 'n1ql' (Query), 'kv' (Data), 'index' (Index), 'fts' (Search), 'eventing' (Eventing), 'analytics' (Analytics), 'backup' (Backup). Returns only nodes running the specified service. If omitted, returns all nodes.",
          },
        },
        required: [],
      },
    },
  },
};

const getFatalRequestsTool: Tool = {
  toolSpec: {
    name: "get_fatal_requests",
    description:
      "Analyze failed N1QL queries including timeouts (>1000ms), errors, and fatal exceptions. Essential for troubleshooting query failures, identifying problematic patterns, and debugging application issues. Returns error details, stack traces, and query text. Default time range: last 7 days. Call with empty object {} for defaults, or specify parameters like {\"limit\": 10, \"period\": \"day\"}.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month", "quarter"],
            description:
              "Time range for analysis. 'day' = last 24 hours, 'week' = last 7 days (default), 'month' = last 30 days, 'quarter' = last 90 days. Longer periods may return more results but take longer to process.",
          },
          limit: {
            type: "number",
            description:
              "Maximum number of failed queries to return (1-1000). Default: 5. Higher limits may impact response time. Results sorted by most recent failures first.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getMostExpensiveQueriesTool: Tool = {
  toolSpec: {
    name: "get_most_expensive_queries",
    description:
      "Identify resource-intensive N1QL queries ranked by total execution time (serviceTime × frequency). Use this to find queries consuming the most cluster resources for optimization. Excludes system queries, INFER, and CREATE INDEX statements. Returns query text, average execution time, and frequency. Call with {} for defaults or {\"limit\": 10, \"period\": \"week\"}.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Results sorted by total resource consumption (execution time × frequency). Higher limits provide more comprehensive analysis but increase response time.",
            default: 5,
          },
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Time window for analysis. 'day' = last 24 hours, 'week' = last 7 days, 'month' = last 30 days. Longer periods provide better statistical accuracy but may include outdated patterns.",
          },
        },
        required: [],
      },
    },
  },
};

const getLongestRunningQueriesTool: Tool = {
  toolSpec: {
    name: "get_longest_running_queries",
    description: "Find N1QL queries with the highest average execution times regardless of frequency. Use this to identify slow queries that need optimization, missing indexes, or query plan improvements. Returns query text with average service time in human-readable format. Call with {} for defaults or {\"limit\": 20}.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getMostFrequentQueriesTool: Tool = {
  toolSpec: {
    name: "get_most_frequent_queries",
    description: "Discover the most frequently executed N1QL queries sorted by execution count. Use this to identify hot queries for caching opportunities, prepared statement candidates, or workload patterns. Excludes system queries and returns query text with execution counts.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getLargestResultSizeQueriesTool: Tool = {
  toolSpec: {
    name: "get_largest_result_size_queries",
    description: "Find N1QL queries returning the largest data volumes (in bytes). Use this to identify queries that may cause memory pressure, network congestion, or client-side performance issues. Essential for optimizing data transfer and implementing pagination.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getLargestResultCountQueriesTool: Tool = {
  toolSpec: {
    name: "get_largest_result_count_queries",
    description: "Identify N1QL queries returning the highest number of documents. Use this to find queries that may benefit from LIMIT clauses, pagination, or more selective WHERE conditions. Different from result size - focuses on document count rather than data volume.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getPrimaryIndexQueriesTool: Tool = {
  toolSpec: {
    name: "get_primary_index_queries",
    description: "Detect N1QL queries using primary indexes instead of secondary indexes. Critical for performance optimization as primary index scans are expensive. Use this to identify queries needing secondary indexes for better performance. Returns query text and execution metrics.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getSystemIndexesTool: Tool = {
  toolSpec: {
    name: "get_system_indexes",
    description: "List all indexes across all buckets and scopes in the cluster. Use this to audit existing indexes, check index distribution, or identify duplicate/redundant indexes. Returns index names, definitions, bucket/scope/collection info, and index types.",
    inputSchema: {
      json: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const getCompletedRequestsTool: Tool = {
  toolSpec: {
    name: "get_completed_requests",
    description: "Retrieve detailed history of completed N1QL queries from the last 8 weeks including execution plans and performance metrics. Use this for forensic analysis, debugging specific queries, or understanding historical workload patterns. Returns full query details with execution plans.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum results to return (1-1000). Default: 5. Higher limits may impact response time.",
            default: 5,
          },
        },
        required: [],
      },
    },
  },
};

const getPreparedStatementsTool: Tool = {
  toolSpec: {
    name: "get_prepared_statements",
    description: "Show all cached prepared statements in the query service. Use this to monitor prepared statement usage, verify statement caching, or identify stale prepared statements. Returns statement names, query text, and usage statistics.",
    inputSchema: {
      json: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const getIndexesToDropTool: Tool = {
  toolSpec: {
    name: "get_indexes_to_drop",
    description: "Analyze index usage to identify candidates for removal including unused indexes, duplicate indexes, or indexes with overlapping coverage. Use this for index optimization and storage reduction. Returns recommendations with rationale for each suggested removal.",
    inputSchema: {
      json: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const getDetailedIndexesTool: Tool = {
  toolSpec: {
    name: "get_detailed_indexes",
    description: "Retrieve comprehensive metadata for all indexes including creation statements, index keys, partition info, build status, and storage statistics. More detailed than get_system_indexes. Use for deep index analysis, troubleshooting, or capacity planning.",
    inputSchema: {
      json: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const getDetailedPreparedStatementsTool: Tool = {
  toolSpec: {
    name: "get_detailed_prepared_statements",
    description: "Access extended information about prepared statements including execution counts, average execution times, last use timestamps, and encoded plans. More comprehensive than get_prepared_statements. Use for performance analysis and prepared statement optimization.",
    inputSchema: {
      json: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};

const getSchemaForCollectionTool: Tool = {
  toolSpec: {
    name: "get_schema_for_collection",
    description:
      "Infer the schema structure of a collection by sampling a document. Returns field names, data types, nested object structures, and example values. Use this to understand data models, plan queries, or verify document structure. Requires collection to have at least one document.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          scope_name: {
            type: "string",
            description: "Name of the scope containing the target collection. Must exist in the default bucket. Case-sensitive. Example: '_default', 'inventory', 'customers'.",
          },
          collection_name: {
            type: "string",
            description: "Name of the collection to analyze schema for. Must exist within the specified scope. Case-sensitive. Example: '_default', 'users', 'orders'. Requires at least one document.",
          },
        },
        required: ["scope_name", "collection_name"],
      },
    },
  },
};

const runSqlPlusPlusQueryTool: Tool = {
  toolSpec: {
    name: "run_sql_plus_plus_query",
    description:
      "Execute custom SQL++ (N1QL) queries within a specific scope context. Supports SELECT, UPDATE, DELETE operations. When using scope context, reference collections directly by name (e.g., FROM `collection` not FROM `bucket`.`scope`.`collection`). Use for data exploration, custom analysis, or operations not covered by other tools.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          scope_name: {
            type: "string",
            description: "Scope context for query execution. Query will run within this scope's context. Case-sensitive. Example: '_default', 'inventory'.",
          },
          query: {
            type: "string",
            description:
              "SQL++ (N1QL) query to execute. When using scope context, reference collections directly by name only (e.g., 'SELECT * FROM `users`' not 'SELECT * FROM `bucket`.`scope`.`users`'). Supports SELECT, UPDATE, DELETE. Max length: 65536 characters.",
          },
        },
        required: ["scope_name", "query"],
      },
    },
  },
};

export class BedrockChatService {
  private client: BedrockRuntimeClient;
  private modelId: string;
  
  // Caching configuration
  private readonly CACHE_CONFIG = {
    type: "ephemeral" as const,
    // TTL is managed automatically by AWS (5 minutes default)
  };

  // Minimum token requirements for caching (per AWS Bedrock docs)
  private readonly MIN_CACHE_TOKENS: Record<string, number> = {
    "anthropic.claude-3-5-sonnet-20241022-v2:0": 1024,
    "anthropic.claude-3-5-sonnet-20240620-v1:0": 1024,
    "eu.anthropic.claude-3-7-sonnet-20250219-v1:0": 1024,
    "anthropic.claude-3-5-haiku-20241022-v1:0": 2048,
    "eu.amazon.nova-pro-v1:0": 1024, // Check AWS docs for exact requirements
  };
  
  // Simple token estimation for when AWS doesn't provide counts
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a simplified approximation for Claude models
    return Math.ceil(text.length / 4);
  }
  
  // Check if content meets minimum token requirements for caching
  private meetsMinTokenRequirement(content: string): boolean {
    const minTokens = this.MIN_CACHE_TOKENS[this.modelId] || 1024;
    const estimatedTokens = this.estimateTokens(content);
    return estimatedTokens >= minTokens;
  }
  
  // Check if we should use prefill to guide tool execution
  private shouldUsePrefill(messages: Array<{ role: string; content: string }>): boolean {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'user') return false;
    
    // Check if user is asking for data that requires tools
    const dataRequestKeywords = [
      'queries', 'cluster', 'nodes', 'vitals', 'indexes', 'performance',
      'show me', 'check', 'analyze', 'get', 'find', 'list', 'any', 'problematic',
      'slow', 'long running', 'expensive', 'fatal', 'errors', 'failed'
    ];
    
    return dataRequestKeywords.some(keyword => 
      lastMessage.content.toLowerCase().includes(keyword)
    );
  }
  
  // Create prefill message to guide tool execution
  private createPrefillMessage(): Message {
    return {
      role: "assistant",
      content: [
        {
          text: "I'll retrieve the actual data from your Couchbase cluster using the appropriate diagnostic tools."
        }
      ]
    };
  }
  
  // Helper to get normalized model name for Langsmith
  private getNormalizedModelName(): string {
    // Map AWS Bedrock model IDs to Langsmith-recognized model names
    const modelMappings: { [key: string]: string } = {
      // Claude 3.7 Sonnet - use the full version format that LangChain/LangSmith expects
      "eu.anthropic.claude-3-7-sonnet-20250219-v1:0": "claude-3-7-sonnet-20250219",
      // Claude 3.5 Sonnet mappings
      "anthropic.claude-3-5-sonnet-20241022-v2:0": "claude-3-5-sonnet-20241022",
      "anthropic.claude-3-5-sonnet-20240620-v1:0": "claude-3-5-sonnet-20240620",
      // Amazon Nova Pro
      "eu.amazon.nova-pro-v1:0": "amazon.nova-pro-v1",
    };
    
    return modelMappings[this.modelId] || this.modelId;
  }
  
  private tools: Tool[] = [
    getSystemVitalsTool,
    getSystemNodesTool,
    getFatalRequestsTool,
    getMostExpensiveQueriesTool,
    getLongestRunningQueriesTool,
    getMostFrequentQueriesTool,
    getLargestResultSizeQueriesTool,
    getLargestResultCountQueriesTool,
    getPrimaryIndexQueriesTool,
    getSystemIndexesTool,
    getCompletedRequestsTool,
    getPreparedStatementsTool,
    getIndexesToDropTool,
    getDetailedIndexesTool,
    getDetailedPreparedStatementsTool,
    getSchemaForCollectionTool,
    runSqlPlusPlusQueryTool,
  ];

  constructor(region: string = "eu-central-1") {
    log("🔧 [BedrockChat] Constructor called", {
      region,
      approach: "using global connection",
    });

    // Build credentials object safely
    const credentials: any = {
      accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || "DUMMY",
      secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || "DUMMY",
    };

    // Only add sessionToken if it exists and is not empty
    if (
      Bun.env.AWS_BEARER_TOKEN_BEDROCK &&
      Bun.env.AWS_BEARER_TOKEN_BEDROCK.trim()
    ) {
      credentials.sessionToken = Bun.env.AWS_BEARER_TOKEN_BEDROCK;
    }

    this.client = new BedrockRuntimeClient({
      region,
      credentials,
      maxAttempts: 3,
      retryMode: "adaptive",
      // Use HTTP/1.1 handler to avoid Bun HTTP/2 compatibility issues
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
      }),
    });
    this.modelId = Bun.env.BEDROCK_CHAT_MODEL || "anthropic.claude-3-5-sonnet-20241022-v2:0";
  }
  
  // Create cached system content blocks
  private createCachedSystemPrompt(systemPrompt: string, enableCaching: boolean = true): SystemContentBlock[] {
    if (!enableCaching) {
      // Return non-cached version
      return systemPrompt ? [{ text: systemPrompt }] : [];
    }
    
    const systemBlocks: SystemContentBlock[] = [];

    // Split the system prompt to separate dynamic from static content
    // Extract base instructions (before tool_execution_rules) if present
    const toolRulesStart = systemPrompt.indexOf('<tool_execution_rules>');
    
    if (toolRulesStart === -1) {
      // No tool rules found, check if entire prompt meets caching requirements
      if (this.meetsMinTokenRequirement(systemPrompt)) {
        systemBlocks.push({
          text: systemPrompt,
          cacheControl: this.CACHE_CONFIG
        });
        log("📦 [BedrockChat] Created cached system prompt block", {
          blockLength: systemPrompt.length,
          estimatedTokens: Math.ceil(systemPrompt.length / 4),
          cacheConfig: this.CACHE_CONFIG,
        });
      } else {
        systemBlocks.push({ text: systemPrompt });
        log("⚠️ [BedrockChat] System prompt too short for caching", {
          blockLength: systemPrompt.length,
          requiredLength: this.MIN_TOKENS_FOR_CACHE * 4, // Approximate chars
        });
      }
      return systemBlocks;
    }
    
    // Split into base instructions and tool guidance
    const baseInstructions = systemPrompt.substring(0, toolRulesStart).trim();
    const toolGuidance = systemPrompt.substring(toolRulesStart).trim();
    
    // Add base instructions (not cached - usually small and may be dynamic)
    if (baseInstructions) {
      systemBlocks.push({ text: baseInstructions });
    }
    
    // Add tool guidance (cached if meets requirements)
    if (toolGuidance && this.meetsMinTokenRequirement(toolGuidance)) {
      systemBlocks.push({
        text: toolGuidance,
        cacheControl: this.CACHE_CONFIG
      });
      
      log("🔄 [BedrockChat] Created cached system prompt block", {
        toolGuidanceLength: toolGuidance.length,
        estimatedTokens: this.estimateTokens(toolGuidance),
        minTokenRequirement: this.MIN_CACHE_TOKENS[this.modelId] || 1024,
      });
    } else if (toolGuidance) {
      systemBlocks.push({ text: toolGuidance });
    }
    
    return systemBlocks;
  }

  private executeToolInContext = async (name: string, input: any, parentRunTree?: RunTree, retryCount: number = 0): Promise<ToolExecutionResult> => {
    const maxRetries = 2;
    
    // Use enhanced validation with sanitization
    const validation = validateToolInputWithRetry(name, input);
    
    if (!validation.success) {
      // If validation failed but we have a sanitized input and haven't exceeded retries
      if (validation.sanitizedInput && retryCount < maxRetries) {
        log("🔄 [Tool] Auto-correcting input format", {
          toolName: name,
          originalInput: JSON.stringify(input).substring(0, 200),
          sanitizedInput: JSON.stringify(validation.sanitizedInput).substring(0, 200),
          retryCount: retryCount + 1,
          hint: validation.hint,
        });
        
        // Retry with sanitized input
        return this.executeToolInContext(name, validation.sanitizedInput, parentRunTree, retryCount + 1);
      }
      
      // If no sanitization available or max retries reached
      log("❌ [Tool] Input validation failed", {
        toolName: name,
        error: validation.error,
        input: JSON.stringify(input).substring(0, 200),
        retriesExhausted: retryCount >= maxRetries,
      });
      
      return {
        success: false,
        error: validation.error,
        content: `❌ Invalid input: ${validation.error}`,
      };
    }

    // Log if input was auto-corrected
    if (validation.wasAutoCorrected) {
      log("✅ [Tool] Input auto-corrected successfully", {
        toolName: name,
        originalInput: JSON.stringify(input).substring(0, 200),
        correctedInput: JSON.stringify(validation.data).substring(0, 200),
      });
    }

    // Use validated input
    const validatedInput = validation.data;

    // Try to get the current run tree context, or use the provided parent
    let currentRunTree = parentRunTree;
    if (!currentRunTree) {
      try {
        currentRunTree = getCurrentRunTree(true); // Allow absent run tree
      } catch (error) {
        // If we're not in a traceable context, currentRunTree will be undefined
        currentRunTree = undefined;
      }
    }

    log("🔧 [Tool] Setting up tool execution context", {
      toolName: name,
      hasParentContext: !!currentRunTree,
      parentTraceId: currentRunTree?.id,
      parentName: currentRunTree?.name,
      inputKeys: Object.keys(validatedInput || {}),
      validatedInput: JSON.stringify(validatedInput).substring(0, 200),
    });

    // Execute tool function with tracing
    const executeSpecificTool = traceable(
      async (toolName: string, toolInput: any) => {
        log("🔧 [TRACE DEBUG] Executing tool within trace context", {
          toolName,
          inputKeys: Object.keys(toolInput || {}),
        });

        const toolStartTime = Date.now();
        
        let result;
        switch (toolName) {
        case "get_system_vitals":
          result = await this.executeGetSystemVitals(toolInput?.node_filter);
          break;
        case "get_system_nodes":
          result = await this.executeGetSystemNodes(toolInput?.service_filter);
          break;
        case "get_fatal_requests":
          result = await this.executeGetFatalRequests(toolInput?.period, toolInput?.limit);
          break;
        case "get_most_expensive_queries":
          result = await this.executeGetMostExpensiveQueries(toolInput?.limit, toolInput?.period);
          break;
        case "get_longest_running_queries":
          result = await this.executeGetLongestRunningQueries(toolInput?.limit);
          break;
        case "get_most_frequent_queries":
          result = await this.executeGetMostFrequentQueries(toolInput?.limit);
          break;
        case "get_largest_result_size_queries":
          result = await this.executeGetLargestResultSizeQueries(toolInput?.limit);
          break;
        case "get_largest_result_count_queries":
          result = await this.executeGetLargestResultCountQueries(toolInput?.limit);
          break;
        case "get_primary_index_queries":
          result = await this.executeGetPrimaryIndexQueries(toolInput?.limit);
          break;
        case "get_system_indexes":
          result = await this.executeGetSystemIndexes();
          break;
        case "get_completed_requests":
          result = await this.executeGetCompletedRequests(toolInput?.limit);
          break;
        case "get_prepared_statements":
          result = await this.executeGetPreparedStatements();
          break;
        case "get_indexes_to_drop":
          result = await this.executeGetIndexesToDrop();
          break;
        case "get_detailed_indexes":
          result = await this.executeGetDetailedIndexes();
          break;
        case "get_detailed_prepared_statements":
          result = await this.executeGetDetailedPreparedStatements();
          break;
        case "get_schema_for_collection":
          result = await this.executeGetSchemaForCollection(toolInput?.scope_name, toolInput?.collection_name);
          break;
        case "run_sql_plus_plus_query":
          result = await this.executeRunSqlPlusPlusQuery(toolInput?.scope_name, toolInput?.query);
          break;
        default:
          result = {
            success: false,
            error: `Unknown tool: ${toolName}`,
            content: `Error: Unknown tool '${toolName}'. Available tools: get_system_vitals, get_system_nodes, get_fatal_requests, get_most_expensive_queries, get_longest_running_queries, get_most_frequent_queries, get_largest_result_size_queries, get_largest_result_count_queries, get_primary_index_queries, get_system_indexes, get_completed_requests, get_prepared_statements, get_indexes_to_drop, get_detailed_indexes, get_detailed_prepared_statements, get_schema_for_collection, run_sql_plus_plus_query`,
          };
      }

      const toolExecutionTime = Date.now() - toolStartTime;
      
      log("✅ [Tool] Tool execution completed within parent context", {
        toolName,
        success: result?.success,
        executionTimeMs: toolExecutionTime,
        hasParentContext: !!currentRunTree,
        parentTraceId: currentRunTree?.id,
        resultSize: result?.data?.count || 0,
      });

      return result;
      },
      {
        name: `Tool: ${name}`,
        run_type: "tool",
      }
    );

    // Execute within parent trace context if available
    if (currentRunTree) {
      log("🔗 [Tool] Executing within parent trace context using withRunTree", {
        toolName: name,
        parentTraceId: currentRunTree.id,
        parentName: currentRunTree.name,
      });
      
      return await withRunTree(currentRunTree, async () => {
        return await executeSpecificTool(name, validatedInput);
      });
    } else {
      log("⚠️ [Tool] No parent trace context available, executing directly", {
        toolName: name,
      });
      
      return await executeSpecificTool(name, validatedInput);
    }
  };

  private executeGetSystemVitals = async (
    node_filter?: string,
  ): Promise<ToolExecutionResult> => {
    try {
      log("🔍 [Tool] Executing get_system_vitals", {
        node_filter,
        approach: "using global connection",
      });

      const startTime = Date.now();

      log("🔍 [Tool] Getting cluster connection...");
      const cluster = await clusterConn();

      log("✅ [Tool] Got cluster, building query");

      let query = systemVitalsQuery;

      // Apply node filter if specified
      if (node_filter) {
        // Escape special characters to prevent SQL injection
        const escapedFilter = node_filter.replace(/['"%_\\]/g, '\\$&');
        query = query.replace(
          "SELECT * FROM system:vitals;",
          `SELECT * FROM system:vitals WHERE node LIKE "%${escapedFilter}%";`,
        );
      }

      log("🔄 [Tool] Executing query", {
        query: query.substring(0, 100) + "...",
      });

      // Execute the query directly through the cluster (same as test endpoint)
      const result = await cluster.query(query);

      log("✅ [Tool] Query executed, processing results");
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      log("📊 [Tool] Query results", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        hasFilter: !!node_filter,
      });

      // Format the response
      const responseText =
        `# Couchbase System Vitals (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No results found for this query."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
      };
    } catch (error) {
      err("❌ [Tool] Get system vitals failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `System vitals query failed: ${error.message}`,
      };
    }
  };

  private executeGetSystemNodes = async (
    service_filter?: string,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_system_nodes", {
        service_filter,
        approach: "using global connection",
      });

      const startTime = Date.now();

      // Use the global connection approach
      const cluster = await clusterConn();

      // Build the query based on parameters
      let query = systemNodesQuery;

      // Apply service filter if specified
      if (service_filter) {
        // Service filter is already validated by Zod enum, so it's safe
        query = query.replace(
          "SELECT * FROM system:nodes;",
          `SELECT * FROM system:nodes WHERE ANY s IN services SATISFIES s = "${service_filter}" END;`,
        );
      }

      log("🔄 [Tool] Executing nodes query", {
        query: query.substring(0, 100) + "...",
      });

      // Execute the query
      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      log("📊 [Tool] Nodes query results", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        hasServiceFilter: !!service_filter,
      });

      // Format the response
      const responseText =
        `# Couchbase Cluster Nodes (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No results found for this query."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
      };
    } catch (error) {
      err("❌ [Tool] Get system nodes failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `System nodes query failed: ${error.message}`,
      };
    }
  };

  private executeGetFatalRequests = async (
    period?: string,
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_fatal_requests", {
        period,
        limit,
        approach: "using global connection",
      });

      const startTime = Date.now();

      // Use the global connection approach
      const cluster = await clusterConn();

      // Build the query based on parameters
      let query = n1qlQueryFatalRequests;
      let appliedFilters = [];

      // Apply period filter if specified
      if (period) {
        let periodValue: number;
        let periodUnit: string;

        switch (period) {
          case "day":
            periodValue = 1;
            periodUnit = "day";
            break;
          case "week":
            periodValue = 1;
            periodUnit = "week";
            break;
          case "month":
            periodValue = 1;
            periodUnit = "month";
            break;
          case "quarter":
            periodValue = 3;
            periodUnit = "month";
            break;
          default:
            periodValue = 1;
            periodUnit = "week";
        }

        appliedFilters.push(`period: ${period}`);

        // Replace the DATE_ADD_STR period in the query
        query = query.replace(
          /DATE_ADD_STR\(NOW_STR\(\), -\d+, '\w+'\)/,
          `DATE_ADD_STR(NOW_STR(), -${periodValue}, '${periodUnit}')`,
        );
      }

      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      // Add limit to the end of the query
      query = query.replace(
        "ORDER BY requestTime DESC;",
        `ORDER BY requestTime DESC LIMIT ${effectiveLimit};`,
      );

      log("🔄 [Tool] Executing fatal requests query", {
        query: query.substring(0, 100) + "...",
      });

      // Execute the query
      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      log("📊 [Tool] Fatal requests query results", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        appliedFilters: appliedFilters.join(", ") || "none",
      });

      // Format the response
      const responseText =
        `# Fatal Query Requests (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No fatal requests found for the specified period."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get fatal requests failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Fatal requests query failed: ${error.message}`,
      };
    }
  };

  private executeGetMostExpensiveQueries = async (
    limit?: number,
    period?: string,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_most_expensive_queries", { limit, period });

      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = mostExpensiveQueries;
      let appliedFilters = [];

      if (period) {
        appliedFilters.push(`period: ${period}`);
        let periodClause: string;
        switch (period) {
          case "day":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'day')";
            break;
          case "week":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
            break;
          case "month":
            periodClause =
              "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'month')";
            break;
          default:
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
        }
        query = query.replace(
          "WHERE LOWER(statement)",
          `WHERE ${periodClause} AND LOWER(statement)`,
        );
      }

      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;
      const totalCost = rows.reduce(
        (sum, row) => sum + (row.totalElapsedTime || 0),
        0,
      );

      log("📊 [Tool] Most expensive queries results", {
        rowCount: rows.length,
        executionTimeMs: executionTime,
        totalCostMs: totalCost,
        appliedFilters: appliedFilters.join(", ") || "none",
      });

      const responseText =
        `# Most Expensive Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No expensive queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          totalCostMs: totalCost,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get most expensive queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetLongestRunningQueries = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_longest_running_queries", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlLongestRunningQueries;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Longest Running Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get longest running queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetMostFrequentQueries = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_most_frequent_queries", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlMostFrequentQueries;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Most Frequent Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get most frequent queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetLargestResultSizeQueries = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_largest_result_size_queries", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlLargestResultSizeQueries;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Largest Result Size Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get largest result size queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetLargestResultCountQueries = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_largest_result_count_queries", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlLargestResultCountQueries;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Largest Result Count Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get largest result count queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetPrimaryIndexQueries = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_primary_index_queries", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlPrimaryIndexes;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Primary Index Queries (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No primary index queries found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get primary index queries failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  // Helper function to handle large tool outputs and prevent context exhaustion
  private formatLargeToolOutput = (
    rows: any[],
    title: string,
    options: {
      maxItems?: number;
      maxOutputSize?: number;
      generateSummary?: (rows: any[]) => string;
      itemName?: string;
    } = {}
  ): string => {
    const {
      maxItems = 20,
      maxOutputSize = 50000,
      generateSummary,
      itemName = "result"
    } = options;

    let responseText = "";

    // If we have many results and a summary generator, use it
    if (rows.length > maxItems && generateSummary) {
      responseText = generateSummary(rows);
    } else if (rows.length > maxItems) {
      // Generic truncation message
      const limitedRows = rows.slice(0, maxItems);
      responseText = `# ${title} (showing ${maxItems} of ${rows.length} total)\n\n` +
        `⚠️ **Large result set**: Showing first ${maxItems} ${itemName}s to prevent context exhaustion.\n` +
        `To see specific results, use more targeted queries or filters.\n\n` +
        `\`\`\`json\n${JSON.stringify(limitedRows, null, 2)}\n\`\`\``;
    } else {
      // Small result set, show full output
      responseText = `# ${title} (${rows.length} ${itemName}${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? `No ${itemName}s found.`
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);
    }

    // Final size check
    if (responseText.length > maxOutputSize) {
      const truncatedText = responseText.substring(0, maxOutputSize);
      responseText = truncatedText +
        `\n\`\`\`\n\n⚠️ **Output truncated** - Result was too large (${responseText.length} chars). ` +
        `Context window preservation in effect. Please use more specific queries.`;
    }

    return responseText;
  };

  private executeGetSystemIndexes = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_system_indexes");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(n1qlSystemIndexes);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      // Implement result limits to prevent context exhaustion
      const MAX_INDEXES_TO_SHOW = 20;
      const MAX_OUTPUT_SIZE = 50000; // ~12.5k tokens
      
      let responseText = "";
      
      // If we have many results, provide a summary instead of full output
      if (rows.length > MAX_INDEXES_TO_SHOW) {
        // Calculate statistics for summary
        const indexesByKeyspace: Record<string, number> = {};
        const indexesByType: Record<string, number> = { primary: 0, secondary: 0, array: 0 };
        const indexesByState: Record<string, number> = { online: 0, building: 0, deferred: 0 };
        
        rows.forEach((row: any) => {
          // Count by keyspace
          const keyspace = `${row.bucket_id || 'unknown'}.${row.scope_id || '_default'}.${row.keyspace_id || '_default'}`;
          indexesByKeyspace[keyspace] = (indexesByKeyspace[keyspace] || 0) + 1;
          
          // Count by type
          if (row.is_primary) indexesByType.primary++;
          else if (row.index_key?.includes('ARRAY')) indexesByType.array++;
          else indexesByType.secondary++;
          
          // Count by state
          const state = row.state?.toLowerCase() || 'unknown';
          if (state in indexesByState) {
            indexesByState[state]++;
          }
        });
        
        // Sort keyspaces by count
        const topKeyspaces = Object.entries(indexesByKeyspace)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10);
        
        responseText = `# System Indexes Summary\n\n` +
          `**Total Indexes**: ${rows.length} (showing summary due to large result set)\n\n` +
          `## By Type:\n` +
          `- Primary: ${indexesByType.primary}\n` +
          `- Secondary: ${indexesByType.secondary}\n` +
          `- Array: ${indexesByType.array}\n\n` +
          `## By State:\n` +
          `- Online: ${indexesByState.online}\n` +
          `- Building: ${indexesByState.building}\n` +
          `- Deferred: ${indexesByState.deferred}\n\n` +
          `## Top Keyspaces by Index Count:\n` +
          topKeyspaces.map(([ks, count]) => `- ${ks}: ${count} indexes`).join('\n') +
          `\n\n⚠️ **Note**: Showing summary of ${rows.length} indexes to prevent context exhaustion.\n` +
          `To see specific indexes:\n` +
          `- Use \`get_detailed_indexes\` with filters\n` +
          `- Query for indexes on a specific keyspace\n` +
          `- Search by index name or type`;
          
        // Include first few indexes as examples
        if (rows.length > 0) {
          const exampleRows = rows.slice(0, 3);
          responseText += `\n\n### Example Indexes (first 3):\n\`\`\`json\n${JSON.stringify(exampleRows, null, 2)}\n\`\`\``;
        }
      } else {
        // Small result set, show full output but check size
        const fullJson = JSON.stringify(rows, null, 2);
        responseText = `# System Indexes (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
          (rows.length === 0
            ? "No system indexes found."
            : `\`\`\`json\n${fullJson}\n\`\`\``);
            
        // Still check total output size
        if (responseText.length > MAX_OUTPUT_SIZE) {
          responseText = responseText.substring(0, MAX_OUTPUT_SIZE) +
            `\n\`\`\`\n\n⚠️ **Output truncated** - Result was too large (${responseText.length} chars). ` +
            `Please use more specific queries.`;
        }
      }

      log("✅ [Tool] System indexes query completed", {
        totalIndexes: rows.length,
        outputSize: responseText.length,
        wasLimited: rows.length > MAX_INDEXES_TO_SHOW,
      });

      return {
        success: true,
        content: responseText,
        data: { 
          rows: rows.slice(0, MAX_INDEXES_TO_SHOW), // Limit data returned
          totalCount: rows.length,
          limited: rows.length > MAX_INDEXES_TO_SHOW,
          executionTimeMs: executionTime 
        },
      };
    } catch (error) {
      err("❌ [Tool] Get system indexes failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetCompletedRequests = async (
    limit?: number,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_completed_requests", { limit });
      const startTime = Date.now();
      const cluster = await clusterConn();

      let query = n1qlCompletedRequests;
      let appliedFilters = [];
      // Apply limit if specified, otherwise use default of 5
      const effectiveLimit = limit && limit > 0 ? limit : 5;
      appliedFilters.push(`limit: ${effectiveLimit}`);
      query = query.replace(/;\s*$/, ` LIMIT ${effectiveLimit};`);

      const result = await cluster.query(query);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Completed Requests (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No completed requests found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          appliedFilters,
        },
      };
    } catch (error) {
      err("❌ [Tool] Get completed requests failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetPreparedStatements = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_prepared_statements");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(n1qlPreparedStatements);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      // Use the helper to format output with size limits
      const responseText = this.formatLargeToolOutput(
        rows,
        "Prepared Statements",
        {
          maxItems: 20,
          itemName: "prepared statement",
          generateSummary: (rows) => {
            // Group by status or other attributes
            const byStatus: Record<string, number> = {};
            rows.forEach((row: any) => {
              const status = row.state || 'unknown';
              byStatus[status] = (byStatus[status] || 0) + 1;
            });
            
            return `# Prepared Statements Summary\n\n` +
              `**Total Prepared Statements**: ${rows.length}\n\n` +
              `## By Status:\n` +
              Object.entries(byStatus).map(([status, count]) => `- ${status}: ${count}`).join('\n') +
              `\n\n⚠️ **Note**: Showing summary of ${rows.length} prepared statements to prevent context exhaustion.\n` +
              `To see specific statements, use filters or query for specific names.`;
          }
        }
      );

      log("✅ [Tool] Prepared statements query completed", {
        totalStatements: rows.length,
        outputSize: responseText.length,
      });

      return {
        success: true,
        content: responseText,
        data: { 
          rows: rows.slice(0, 20), // Limit data returned
          totalCount: rows.length,
          limited: rows.length > 20,
          executionTimeMs: executionTime 
        },
      };
    } catch (error) {
      err("❌ [Tool] Get prepared statements failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetIndexesToDrop = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_indexes_to_drop");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(n1qlIndexesToDrop);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# Indexes to Drop (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No unused indexes found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
      };
    } catch (error) {
      err("❌ [Tool] Get indexes to drop failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetDetailedIndexes = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_detailed_indexes");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(detailedIndexesQuery);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      // Use the helper to format output with size limits
      const responseText = this.formatLargeToolOutput(
        rows,
        "Detailed Indexes",
        {
          maxItems: 15, // Even more restrictive for detailed view
          itemName: "index",
          generateSummary: (rows) => {
            const indexesByBucket: Record<string, number> = {};
            const indexesByType: Record<string, number> = {};
            let totalStorageSize = 0;
            
            rows.forEach((row: any) => {
              // Count by bucket
              const bucket = row.bucket || row.bucket_id || 'unknown';
              indexesByBucket[bucket] = (indexesByBucket[bucket] || 0) + 1;
              
              // Count by index type
              const indexType = row.using || 'gsi';
              indexesByType[indexType] = (indexesByType[indexType] || 0) + 1;
              
              // Sum storage if available
              if (row.storageSize) {
                totalStorageSize += parseInt(row.storageSize) || 0;
              }
            });
            
            const topBuckets = Object.entries(indexesByBucket)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5);
            
            return `# Detailed Indexes Summary\n\n` +
              `**Total Indexes**: ${rows.length}\n` +
              `**Total Storage**: ${(totalStorageSize / 1024 / 1024 / 1024).toFixed(2)} GB\n\n` +
              `## By Index Type:\n` +
              Object.entries(indexesByType).map(([type, count]) => `- ${type}: ${count}`).join('\n') +
              `\n\n## Top Buckets by Index Count:\n` +
              topBuckets.map(([bucket, count]) => `- ${bucket}: ${count} indexes`).join('\n') +
              `\n\n⚠️ **Note**: Detailed index information can be very large. Showing summary only.\n` +
              `For specific index details:\n` +
              `- Query for indexes on a specific bucket/scope/collection\n` +
              `- Use index name filters\n` +
              `- Request specific index properties`;
          }
        }
      );

      log("✅ [Tool] Detailed indexes query completed", {
        totalIndexes: rows.length,
        outputSize: responseText.length,
      });

      return {
        success: true,
        content: responseText,
        data: { 
          rows: rows.slice(0, 15), // Limit data returned
          totalCount: rows.length,
          limited: rows.length > 15,
          executionTimeMs: executionTime 
        },
      };
    } catch (error) {
      err("❌ [Tool] Get detailed indexes failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetDetailedPreparedStatements = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_detailed_prepared_statements");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(detailedPreparedStatementsQuery);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      // Use the helper to format output with size limits
      const responseText = this.formatLargeToolOutput(
        rows,
        "Detailed Prepared Statements",
        {
          maxItems: 10, // Very restrictive for detailed statements
          itemName: "prepared statement",
          generateSummary: (rows) => {
            const statementsByNode: Record<string, number> = {};
            const recentStatements: any[] = [];
            
            rows.forEach((row: any) => {
              // Count by node
              const node = row.node || 'unknown';
              statementsByNode[node] = (statementsByNode[node] || 0) + 1;
              
              // Track recent statements
              if (row.lastUse && recentStatements.length < 5) {
                recentStatements.push({
                  name: row.name || 'unnamed',
                  lastUse: row.lastUse,
                  uses: row.uses || 0
                });
              }
            });
            
            return `# Detailed Prepared Statements Summary\n\n` +
              `**Total Prepared Statements**: ${rows.length}\n\n` +
              `## Distribution by Node:\n` +
              Object.entries(statementsByNode).map(([node, count]) => `- ${node}: ${count} statements`).join('\n') +
              `\n\n## Most Recently Used:\n` +
              recentStatements.map(s => `- ${s.name} (${s.uses} uses)`).join('\n') +
              `\n\n⚠️ **Note**: Detailed statement information includes full query text which can be very large.\n` +
              `To see specific statements:\n` +
              `- Query by statement name\n` +
              `- Filter by node\n` +
              `- Request recently used statements only`;
          }
        }
      );

      log("✅ [Tool] Detailed prepared statements query completed", {
        totalStatements: rows.length,
        outputSize: responseText.length,
      });

      return {
        success: true,
        content: responseText,
        data: { 
          rows: rows.slice(0, 10), // Limit data returned
          totalCount: rows.length,
          limited: rows.length > 10,
          executionTimeMs: executionTime 
        },
      };
    } catch (error) {
      err("❌ [Tool] Get detailed prepared statements failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Query failed: ${error.message}`,
      };
    }
  };

  private executeGetSchemaForCollection = async (
    scope_name: string,
    collection_name: string,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_schema_for_collection", {
        scope_name,
        collection_name,
      });

      const startTime = Date.now();
      const cluster = await clusterConn();
      const bucket = cluster.bucket(backendConfig.capella.BUCKET);

      // Check if scope and collection exist
      const collectionMgr = bucket.collections();
      const scopes = await collectionMgr.getAllScopes();
      const foundScope = scopes.find((s) => s.name === scope_name);
      if (!foundScope) {
        return {
          success: false,
          error: `Scope "${scope_name}" does not exist`,
          content: `❌ Error: Scope "${scope_name}" does not exist`,
        };
      }

      const foundCollection = foundScope.collections.find(
        (c) => c.name === collection_name,
      );
      if (!foundCollection) {
        return {
          success: false,
          error: `Collection "${collection_name}" does not exist in scope "${scope_name}"`,
          content: `❌ Error: Collection "${collection_name}" does not exist in scope "${scope_name}"`,
        };
      }

      // Sample a document to infer schema
      const result = await bucket
        .scope(scope_name)
        .query("SELECT * FROM `" + collection_name + "` LIMIT 1");
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;

      if (rows.length === 0) {
        log("⚠️ [Tool] No documents found for schema inference", {
          scope_name,
          collection_name,
          executionTimeMs: executionTime,
        });
        return {
          success: true,
          content: "❌ No documents found in collection to infer schema",
          data: { rows: [], count: 0, executionTimeMs: executionTime },
        };
      }

      // Count schema fields
      const fieldCount = Object.keys(rows[0]).length;
      const docSize = JSON.stringify(rows[0]).length;

      log("📊 [Tool] Schema inference complete", {
        scope_name,
        collection_name,
        fieldCount,
        docSizeBytes: docSize,
        executionTimeMs: executionTime,
      });

      // Format schema
      const formatSchema = (doc: any): string => {
        let formattedText = "📊 Collection Schema:\n\n";
        const formatField = (
          key: string,
          value: unknown,
          indent: number = 0,
        ): string => {
          const padding = "  ".repeat(indent);
          const type =
            value === null
              ? "null"
              : Array.isArray(value)
                ? "array"
                : typeof value;
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

        formattedText += Object.entries(rows[0])
          .map(([key, value]) => formatField(key, value))
          .join("\n");
        return formattedText;
      };

      return {
        success: true,
        content: formatSchema(rows[0]),
        data: {
          rows: [rows[0]],
          count: 1,
          executionTimeMs: executionTime,
          fieldCount,
          docSizeBytes: docSize,
        },
      };
    } catch (error) {
      if (error.message && error.message.includes("index")) {
        return {
          success: false,
          error: "Index failure",
          content:
            "❌ Database error: index failure. Please create a primary index on this collection to enable schema inference. Example:\n\nCREATE PRIMARY INDEX ON `bucket`.`scope`.`collection`;",
        };
      }
      err("❌ [Tool] Get schema for collection failed", {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        content: `Schema query failed: ${error.message}`,
      };
    }
  };

  private executeRunSqlPlusPlusQuery = async (
    scope_name: string,
    query: string,
  ): Promise<any> => {
    try {
      log("🔍 [Tool] Executing run_sql_plus_plus_query", {
        scope_name,
        query: query.substring(0, 100) + "...",
      });

      const startTime = Date.now();
      const cluster = await clusterConn();
      const bucket = cluster.bucket(backendConfig.capella.BUCKET);

      const queryLength = query.length;
      const queryType = query.trim().split(" ")[0].toUpperCase();

      // Validate query doesn't use full bucket.scope.collection path
      if (/from\s+[`\w]+\.[`\w]+\.[`\w]+/i.test(query)) {
        return {
          success: false,
          error: "Invalid query format",
          content:
            "❌ Error: Query uses full bucket.scope.collection path. When using scope context, only use the collection name in the query. For example: SELECT COUNT(*) FROM `_default`",
        };
      }

      // Execute query in scope context
      const result = await bucket.scope(scope_name).query(query);
      const rows = await result.rows;

      const executionTime = Date.now() - startTime;
      const resultSize = JSON.stringify(rows).length;

      log("✅ [Tool] SQL++ query executed", {
        scope_name,
        queryType,
        queryLength,
        rowCount: rows.length,
        resultSizeBytes: resultSize,
        executionTimeMs: executionTime,
      });

      // Handle special case for distinct_source_count
      if (rows.length === 1 && "distinct_source_count" in rows[0]) {
        return {
          success: true,
          content: `Found ${rows[0].distinct_source_count} distinct sources`,
          data: {
            rows,
            count: rows.length,
            executionTimeMs: executionTime,
            queryType,
            resultSizeBytes: resultSize,
          },
        };
      }

      const responseText =
        `# SQL++ Query Results (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        `**Query:** \`${query}\`\n\n` +
        `**Scope:** \`${scope_name}\`\n\n` +
        (rows.length === 0
          ? "No results found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: {
          rows,
          count: rows.length,
          executionTimeMs: executionTime,
          queryType,
          resultSizeBytes: resultSize,
        },
      };
    } catch (error) {
      err("❌ [Tool] Run SQL++ query failed", { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `SQL++ query failed: ${error.message}`,
      };
    }
  };

  // Helper function to convert Bedrock Message format to simple format
  private convertBedrockMessageToSimple(message: Message): { role: string; content: string } {
    let content = "";
    
    if (message.content && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.text) {
          content += block.text;
        } else if (block.toolResult) {
          // Convert tool results to readable text
          const toolResult = block.toolResult;
          if (toolResult.content && Array.isArray(toolResult.content)) {
            for (const resultBlock of toolResult.content) {
              if (resultBlock.text) {
                content += resultBlock.text + "\n";
              }
            }
          }
        } else if (block.toolUse) {
          // Include tool use information in the content
          content += `[Tool called: ${block.toolUse.name}]\n`;
        }
      }
    }
    
    return {
      role: message.role,
      content: content.trim() || ""
    };
  }

  // Function to create a streaming chat completion using Converse API
  private async *_createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
      traceHeaders?: Record<string, string>;
      userId?: string;
      sessionId?: string;
      conversationId?: string;
      recursionDepth?: number;
      enableCaching?: boolean;
    } = {},
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Log trace headers for debugging
      let parentRunTree: RunTree | undefined;
      
      log("🔧 [BedrockChat] Debug - Full options object", {
        optionsKeys: Object.keys(options),
        hasTraceHeaders: !!options.traceHeaders,
        traceHeadersType: typeof options.traceHeaders,
        optionsString: JSON.stringify(options, null, 2).substring(0, 500),
      });
      
      if (options.traceHeaders) {
        log("🔗 [BedrockChat] Received trace headers", {
          headerKeys: Object.keys(options.traceHeaders),
          traceHeadersReceived: true,
          headerCount: Object.keys(options.traceHeaders).length,
          langsmithTrace: options.traceHeaders["langsmith-trace"],
          baggage: options.traceHeaders["baggage"],
        });
        try {
          parentRunTree = await RunTree.fromHeaders(options.traceHeaders);
          log("🔗 [BedrockChat] Successfully created RunTree from headers", {
            traceId: parentRunTree?.id,
            parentId: parentRunTree?.parent_run_id,
            runTreeCreated: true,
            name: parentRunTree?.name,
            runType: parentRunTree?.run_type,
            dotted_path: parentRunTree?.dotted_order,
          });
        } catch (error) {
          log("⚠️ [BedrockChat] Failed to create RunTree from headers", {
            error: error.message,
            headers: Object.keys(options.traceHeaders || {}),
            errorType: error.constructor.name,
            stackTrace: error.stack?.substring(0, 300),
            langsmithTrace: options.traceHeaders["langsmith-trace"],
          });
        }
      } else {
        log("ℹ️ [BedrockChat] No trace headers received", {
          optionsKeys: Object.keys(options),
          optionsString: JSON.stringify(options).substring(0, 200),
        });
      }

      // Separate system messages from conversation messages
      const systemMessages = messages.filter((m) => m.role === "system");
      const conversationMessages = messages.filter((m) => m.role !== "system");

      // Combine system messages with performance analysis guidance
      const baseSystemPrompt = systemMessages.map((m) => m.content).join("\n\n");
      
      // Add XML-structured tool execution guidance with multi-shot examples
      const toolExecutionGuidance = `

<role>
You are a Couchbase database analyst with access to real-time diagnostic tools. 
You MUST use actual function calls to retrieve data, never simulate or mock results.
</role>

<critical_rules>
1. MANDATORY: Use function calling (tool_use) for ALL data requests
2. NEVER write fake JSON or simulated tool results  
3. WAIT for actual tool responses before analysis
4. Verify tool execution occurred (stopReason === "tool_use")
</critical_rules>

<tools_available>
${this.tools.map(t => `- ${t.toolSpec.name}: ${t.toolSpec.description.split('.')[0]}`).join('\n')}
</tools_available>

<execution_protocol>
<step_1>When user requests cluster data, immediately call appropriate tool</step_1>
<step_2>Display "Executing tools..." message while waiting</step_2>
<step_3>Wait for actual tool response</step_3>
<step_4>Present real data returned by tool</step_4>
<step_5>Analyze actual results and provide insights</step_5>
</execution_protocol>

<forbidden_patterns>
<pattern_1>Writing "### Tool: get_fatal_requests" followed by fake JSON</pattern_1>
<pattern_2>Saying "I'll check..." then showing simulated results</pattern_2>
<pattern_3>Providing analysis without actual tool execution</pattern_3>
</forbidden_patterns>

<verification_prompt>
Before ANY response containing cluster analysis, ask yourself:
- Did I call a function using tool_use?
- Did I receive actual data back?
- Am I analyzing real results?

If any answer is NO, execute tools first.
</verification_prompt>

<input_format>
CRITICAL: Tool inputs must be objects:
✅ Correct: {"limit": 10, "period": "week"} or {} for defaults
❌ Wrong: 10 or "week" as bare values
</input_format>

<examples>
<example_1>
<user>Do I have any slow queries?</user>
<assistant_correct>I'll check for slow queries in your cluster by analyzing the longest running queries.

[Function call to get_longest_running_queries with {"limit": 10}]
[Actual tool execution occurs - stopReason: "tool_use"]
[Real data returned from Couchbase]

Based on the actual query analysis results, I found [specific findings from real data]. Here are the queries that need attention: [actual query details].

Recommendations:
1. [Specific recommendations based on real data]
2. [Index suggestions based on actual queries]
</assistant_correct>

<assistant_wrong>I'll check for slow queries in your cluster.

### Tool: get_longest_running_queries
\`\`\`json
{
  "results": [
    {"query": "SELECT * FROM users", "avg_time": "2.5s"}
  ]
}
\`\`\`

Based on this analysis... [This is WRONG - no actual tool was executed]
</assistant_wrong>
</example_1>

<example_2>
<user>Show me system vitals</user>
<assistant_correct>I'll retrieve the current system vitals for your Couchbase cluster.

[Function call to get_system_vitals with {}]
[Tool execution in progress...]
[Real vitals data returned]

Here are your current cluster vitals: [actual vitals data from tool execution]

System Analysis:
- CPU Usage: [real data]
- Memory: [real data] 
- Disk I/O: [real data]

[Recommendations based on actual metrics]
</assistant_correct>

<assistant_wrong>I'll check the system vitals for your cluster.

### Tool: get_system_vitals
\`\`\`json
{
  "cpu_usage": "45%",
  "memory": "8GB used"
}
\`\`\`

Your system looks healthy... [This is WRONG - fake data]
</assistant_wrong>
</example_2>
</examples>

KEY PATTERN: The correct behavior ALWAYS includes:
1. Function call execution (actual tool_use)
2. Waiting for real results  
3. Analysis of actual returned data
4. No fabricated JSON responses`;
      
      const fullSystemPrompt = baseSystemPrompt ? baseSystemPrompt + toolExecutionGuidance : toolExecutionGuidance;
      
      // Create cached system prompt blocks (default enabled unless explicitly disabled)
      const enableCaching = options.enableCaching !== false;
      const systemPromptBlocks = this.createCachedSystemPrompt(fullSystemPrompt, enableCaching);
      
      log("🔄 [BedrockChat] System prompt configuration", {
        systemBlockCount: systemPromptBlocks.length,
        hasCachedBlocks: systemPromptBlocks.some(block => 'cacheControl' in block),
        totalSystemLength: systemPromptBlocks.reduce((sum, block) => sum + block.text.length, 0),
        cachingEnabled: enableCaching,
        modelId: this.modelId,
      });

      // Convert conversation messages to Converse API format
      const converseMessages: Message[] = conversationMessages.map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: [
          {
            text: msg.content,
          },
        ],
      }));

      // AWS Documentation: Include tools with corrected schema
      const toolConfig: ToolConfiguration = { tools: this.tools };

      // Check if we should add prefill to guide tool execution
      const messagesWithPrefill = this.shouldUsePrefill(messages) 
        ? [...converseMessages, this.createPrefillMessage()]
        : converseMessages;
      
      // Create the ConverseStream command
      const command = new ConverseStreamCommand({
        modelId: this.modelId,
        messages: messagesWithPrefill,
        system: systemPromptBlocks.length > 0 ? systemPromptBlocks : undefined,
        toolConfig,
        inferenceConfig: {
          maxTokens: options.max_tokens || backendConfig.rag.BEDROCK_MAX_TOKENS,
          temperature: options.temperature || 0.3,
          // Increase stop sequences to encourage completion of announced actions
          stopSequences: [], // Empty to prevent premature stopping
        },
      });

      // Declare LLM run tree at method scope
      let llmRunTree: RunTree | undefined;
      
      // Create LLM child run for proper token tracking
      if (parentRunTree) {
        llmRunTree = await parentRunTree.createChild({
          name: this.getNormalizedModelName(),
          run_type: "llm",
          inputs: {
            messages: converseMessages,
          },
          extra: {
            metadata: {
              ls_provider: 'anthropic',
              ls_model_name: this.getNormalizedModelName(),
              ls_model_type: 'chat',
            }
          }
        });
        await llmRunTree.postRun();
      }

      log("🚀 [BedrockChat] Starting Converse stream", {
        modelId: this.modelId,
        messagesCount: converseMessages.length,
        hasSystem: systemPromptBlocks.length > 0,
        toolsEnabled: true,
        toolCount: this.tools.length,
        availableTools: this.tools.map(t => t.toolSpec.name),
        hasLLMRunTree: !!llmRunTree,
        cachingEnabled: enableCaching,
      });

      let response;
      try {
        response = await this.client.send(command);
      } catch (sendError) {
        // Check if this is the HTTP/2 destructuring issue
        if (
          sendError.message &&
          sendError.message.includes(
            "Right side of assignment cannot be destructured",
          )
        ) {
          err("❌ [BedrockChat] HTTP/2 destructuring issue during send", {
            modelId: this.modelId,
            error: sendError.message,
          });
          yield "❌ Error: HTTP/2 compatibility issue with AWS SDK. Please try again.";
          return;
        }
        throw sendError;
      }

      if (!response.stream) {
        throw new Error(
          "No response stream received from Bedrock Converse API",
        );
      }

      // Debug: Log initial response structure
      log("🔍 [BedrockChat] Initial response structure", {
        responseKeys: Object.keys(response),
        hasMetadata: !!response.metadata,
        hasUsage: !!response.usage,
        metadataKeys: response.metadata ? Object.keys(response.metadata) : [],
        usageKeys: response.usage ? Object.keys(response.usage) : [],
      });

      // AWS Documentation: Handle both text and tool responses
      let assistantMessage: Message = { role: "assistant", content: [] };
      let fullResponseText = ""; // Track full response for LLM run
      let currentContentIndex = -1;
      let stopReason = "";
      let chunkCount = 0;
      let tokenUsage: TokenUsage | null = null;
      let fakeToolExecutionDetected = false;

      try {
        for await (const event of response.stream) {
          try {
            // Defensive check for $unknown property issues
            if (!event || typeof event !== "object") {
              continue;
            }

            // Skip events with $unknown properties that cause parsing issues
            if ("$unknown" in event) {
              log("⚠️ [BedrockChat] Skipping $unknown event", {
                eventKeys: Object.keys(event),
              });
              continue;
            }

            // Add defensive handling for event structure to prevent $unknown errors
            if (event.messageStart) {
              assistantMessage.role = event.messageStart.role || "assistant";
            } else if (event.contentBlockStart) {
              currentContentIndex++;
              const start = event.contentBlockStart.start;

              if (start?.text !== undefined) {
                assistantMessage.content[currentContentIndex] = { text: "" };
              } else if (start?.toolUse) {
                assistantMessage.content[currentContentIndex] = {
                  toolUse: {
                    toolUseId: start.toolUse.toolUseId,
                    name: start.toolUse.name,
                    input: {},
                  },
                };
              }
            } else if (event.contentBlockDelta) {
              const delta = event.contentBlockDelta.delta;

              // Initialize content block if it doesn't exist (safety fallback)
              if (currentContentIndex === -1 && delta?.text) {
                currentContentIndex = 0;
                assistantMessage.content[currentContentIndex] = { text: "" };
              }

              if (
                delta?.text &&
                assistantMessage.content[currentContentIndex]?.text !==
                  undefined
              ) {
                chunkCount++;
                yield delta.text;
                assistantMessage.content[currentContentIndex].text +=
                  delta.text;
                fullResponseText += delta.text; // Track for LLM run
              } else if (
                delta?.toolUse?.input &&
                assistantMessage.content[currentContentIndex]?.toolUse
              ) {
                try {
                  // Handle potential string vs object input
                  let inputData = delta.toolUse.input;
                  if (typeof inputData === "string") {
                    inputData = JSON.parse(inputData);
                  }
                  assistantMessage.content[currentContentIndex].toolUse.input =
                    inputData;
                } catch (e) {
                  // Accumulate input if it's being streamed in parts
                  if (
                    !assistantMessage.content[currentContentIndex].toolUse
                      .inputBuffer
                  ) {
                    assistantMessage.content[
                      currentContentIndex
                    ].toolUse.inputBuffer = "";
                  }
                  assistantMessage.content[
                    currentContentIndex
                  ].toolUse.inputBuffer += delta.toolUse.input;

                  try {
                    const parsedInput = JSON.parse(
                      assistantMessage.content[currentContentIndex].toolUse
                        .inputBuffer,
                    );
                    assistantMessage.content[
                      currentContentIndex
                    ].toolUse.input = parsedInput;
                    delete assistantMessage.content[currentContentIndex].toolUse
                      .inputBuffer;
                  } catch (e) {
                    // Still accumulating
                  }
                }
              }
            } else if (event.messageStop) {
              stopReason = event.messageStop.stopReason || "";
              
              // Verify tool execution authenticity
              if (ToolExecutionVerifier.detectFakeToolExecution(fullResponseText, stopReason)) {
                log("🚨 [BedrockChat] Detected fake tool execution", {
                  stopReason,
                  responseLength: fullResponseText.length,
                  detectedPatterns: true
                });
                // Set flag to handle retry after stream completes
                fakeToolExecutionDetected = true;
                // Don't yield error to user - we'll handle it internally
              }
              
              // Debug: Check if messageStop contains any usage info
              log("🛑 [BedrockChat] MessageStop event - Response completed", {
                stopReason,
                eventKeys: Object.keys(event.messageStop || {}),
                fullMessageStop: JSON.stringify(event.messageStop, null, 2).substring(0, 300),
                hasAdditionalFields: !!event.messageStop.additionalModelResponseFields,
                additionalFields: event.messageStop.additionalModelResponseFields ? 
                  JSON.stringify(event.messageStop.additionalModelResponseFields, null, 2).substring(0, 300) : null,
                isToolUse: stopReason === "tool_use",
                isEndTurn: stopReason === "end_turn",
                isMaxTokens: stopReason === "max_tokens"
              });
              
              log("✅ [BedrockChat] Converse stream completed", {
                totalChunks: chunkCount,
                stopReason,
                tokenUsage,
                responseLength: fullResponseText.length,
              });
              
              
              // Don't break here - wait for metadata event that comes after messageStop
              // break;
            } else if (event.metadata) {
              // Handle Claude's metadata event which contains usage information
              log("🔍 [BedrockChat] Metadata event received", {
                eventKeys: Object.keys(event.metadata || {}),
                fullMetadata: JSON.stringify(event.metadata, null, 2).substring(0, 500),
              });
              
              // Log complete usage object to debug cache fields
              if (event.metadata.usage) {
                log("📊 [BedrockChat] Full usage object for cache debugging", {
                  allUsageFields: Object.keys(event.metadata.usage),
                  fullUsage: JSON.stringify(event.metadata.usage, null, 2),
                });
              }
              
              if (event.metadata.usage) {
                // Track cache metrics if available (AWS uses different field names)
                const cacheReadTokens = event.metadata.usage.cacheReadInputTokens || 0;
                const cacheCreationTokens = event.metadata.usage.cacheWriteInputTokens || 0;
                
                tokenUsage = {
                  inputTokens: event.metadata.usage.inputTokens || event.metadata.usage.input_tokens || 0,
                  outputTokens: event.metadata.usage.outputTokens || event.metadata.usage.output_tokens || 0,
                  totalTokens: 0, // Will be calculated below
                  model: this.modelId,
                  timestamp: new Date().toISOString(),
                  cacheReadTokens: cacheReadTokens,
                  cacheWriteTokens: cacheCreationTokens,
                };
                tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
                tokenUsage.estimatedCost = calculateCost(tokenUsage);
                
                // Calculate cache savings if cache was hit
                let cacheSavings = 0;
                if (cacheReadTokens > 0) {
                  const normalCost = (cacheReadTokens / 1000) * (MODEL_PRICING[this.modelId]?.inputTokensPerThousand || 0.003);
                  const cachedCost = normalCost * 0.1; // Cache reads cost 10% of normal
                  cacheSavings = normalCost - cachedCost;
                }
                
                log("📊 [BedrockChat] Token usage extracted from metadata event", {
                  inputTokens: tokenUsage.inputTokens,
                  outputTokens: tokenUsage.outputTokens,
                  totalTokens: tokenUsage.totalTokens,
                  estimatedCost: tokenUsage.estimatedCost,
                  cacheReadTokens,
                  cacheWriteTokens: cacheCreationTokens,
                  cacheSavings,
                  cacheHitRatio: tokenUsage.inputTokens > 0 ? (cacheReadTokens / tokenUsage.inputTokens) : 0,
                });
                
                // Additional cache analysis
                if (cacheReadTokens > 0 || cacheCreationTokens > 0) {
                  log("✅ [BedrockChat] Cache is working!", {
                    cacheType: cacheReadTokens > 0 ? "cache_hit" : "cache_creation",
                    tokensSaved: cacheReadTokens,
                    costSaved: cacheSavings.toFixed(4),
                  });
                } else if (systemPromptBlocks.some(block => 'cacheControl' in block)) {
                  log("⚠️ [BedrockChat] Cache blocks present but no cache usage reported", {
                    possibleReasons: [
                      "First request with this prompt (cache being created)",
                      "Model/region doesn't support caching",
                      "Cache expired (5 minute TTL)",
                      "AWS Bedrock not reporting cache metrics"
                    ],
                  });
                }
              }
            } else if (event.contentBlockStop) {
              // Handle content block stop event - this signals the end of a content block
              // No action needed, just acknowledge it to prevent "unknown event" logs
            } else {
              // Debug: Log any other event types we might be missing
              const eventType = Object.keys(event)[0];
              if (eventType && !['messageStart', 'contentBlockStart', 'contentBlockDelta', 'contentBlockStop', 'messageStop', 'metadata'].includes(eventType)) {
                log("🔍 [BedrockChat] Unknown event type", {
                  eventType,
                  eventKeys: Object.keys(event),
                  eventData: JSON.stringify(event, null, 2).substring(0, 200),
                });
              }
            }
          } catch (eventError) {
            // Log event processing errors but continue stream to prevent $unknown crashes
            log("⚠️ [BedrockChat] Event processing error, continuing...", {
              error: eventError.message,
              eventKeys: Object.keys(event || {}),
            });
            continue;
          }
        }

        // Debug: Log response structure after stream consumption with full details
        log("🔍 [BedrockChat] FULL Response after stream consumption", {
          responseKeys: Object.keys(response),
          hasMetadata: !!response.metadata,
          hasUsage: !!response.usage,
          metadataKeys: response.metadata ? Object.keys(response.metadata) : [],
          usageKeys: response.usage ? Object.keys(response.usage) : [],
          fullResponseStructure: JSON.stringify({
            hasStream: !!response.stream,
            hasMetadata: !!response.metadata,
            hasUsage: !!response.usage,
            dollarMetadata: !!response.$metadata,
          }),
          // Full response object inspection (limited for log size)
          fullResponse: JSON.stringify(response, (key, value) => {
            // Skip the stream object to avoid circular refs and large data
            if (key === 'stream') return '[ReadableStream]';
            return value;
          }, 2).substring(0, 1000),
          // Detailed $metadata inspection
          dollarMetadata: response.$metadata ? JSON.stringify(response.$metadata, null, 2).substring(0, 500) : null,
        });

        // Try multiple locations for token usage
        let usageSource = null;
        let usageData = null;

        if (response.metadata?.usage) {
          usageSource = "response.metadata.usage";
          usageData = response.metadata.usage;
        } else if (response.usage) {
          usageSource = "response.usage";
          usageData = response.usage;
        } else if (response.$metadata?.usage) {
          usageSource = "response.$metadata.usage";
          usageData = response.$metadata.usage;
        }

        // Extract token usage from wherever we found it
        if (usageData) {
          const inputTokens = usageData.inputTokens || usageData.input_tokens;
          const outputTokens = usageData.outputTokens || usageData.output_tokens;
          const totalTokens = usageData.totalTokens || usageData.total_tokens;
          
          // Only create tokenUsage if we have actual token values (not zeros)
          if (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) {
            tokenUsage = {
              inputTokens: inputTokens || 0,
              outputTokens: outputTokens || 0,
              totalTokens: totalTokens || (inputTokens || 0) + (outputTokens || 0),
              model: this.modelId,
              timestamp: new Date().toISOString(),
            };
            tokenUsage.estimatedCost = calculateCost(tokenUsage);
          }
          
          if (tokenUsage) {
            log("📊 [BedrockChat] Token usage extracted from " + usageSource, {
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              totalTokens: tokenUsage.totalTokens,
              estimatedCost: tokenUsage.estimatedCost,
              model: tokenUsage.model,
              cacheReadInputTokens: usageData.cacheReadInputTokens || 0,
              cacheWriteInputTokens: usageData.cacheWriteInputTokens || 0,
              usageSource,
            });
          } else {
            log("⚠️ [BedrockChat] Token usage data found but all values are zero or missing", {
              usageSource,
              usageDataKeys: Object.keys(usageData),
              rawUsageData: JSON.stringify(usageData).substring(0, 200),
            });
          }
        }
          
        // End the LLM run with or without token usage
        if (llmRunTree) {
          if (tokenUsage) {
            // We have actual token usage - send it to Langsmith
            await llmRunTree.end({
              outputs: {
                generations: [[{ text: fullResponseText }]],
                // usage_metadata at the outputs level per LangSmith docs
                usage_metadata: {
                  input_tokens: tokenUsage.inputTokens,
                  output_tokens: tokenUsage.outputTokens,
                  total_tokens: tokenUsage.totalTokens,
                  // Optional token details
                  input_token_details: usageData ? {
                    cache_read: cacheReadTokens || 0,
                    cache_write: cacheCreationTokens || 0
                  } : {},
                  output_token_details: {},
                  // Model information
                  ls_provider: 'anthropic',
                  ls_model_name: this.getNormalizedModelName(),
                  ls_model_type: 'chat',
                  // Additional cost information (removed per user request)
                }
              },
              extra: {
                metadata: {
                  ls_provider: 'anthropic',
                  ls_model_name: this.getNormalizedModelName(),
                  ls_model_type: 'chat',
                  ls_stop_reason: stopReason,
                  is_tool_use: stopReason === "tool_use",
                  is_end_turn: stopReason === "end_turn",
                  is_max_tokens: stopReason === "max_tokens",
                }
              }
            });
            await llmRunTree.patchRun();
            
            log("🔗 [BedrockChat] Ended LLM run with token usage", {
              llmRunTreeId: llmRunTree.id,
              tokenUsage: tokenUsage,
              sentToLangSmith: {
                input_tokens: tokenUsage.inputTokens,
                output_tokens: tokenUsage.outputTokens,
                total_tokens: tokenUsage.totalTokens,
                ls_provider: 'anthropic',
                ls_model_name: this.getNormalizedModelName(),
                ls_model_type: 'chat',
              },
              runTreeOutputs: llmRunTree.outputs ? Object.keys(llmRunTree.outputs) : 'undefined'
            });
          } else {
            // No token usage from AWS - provide estimates for Langsmith
            // Estimate tokens based on message content
            const inputText = converseMessages.map(m => {
              if (m.role === 'user' && m.content) {
                return m.content.map(c => c.text || '').join(' ');
              } else if (m.role === 'assistant' && m.content) {
                return m.content.map(c => c.text || '').join(' ');
              }
              return '';
            }).join(' ');
            
            const estimatedInputTokens = this.estimateTokens(inputText);
            const estimatedOutputTokens = this.estimateTokens(fullResponseText);
            const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
            
            await llmRunTree.end({
              outputs: {
                generations: [[{ text: fullResponseText }]],
                // usage_metadata at the outputs level per LangSmith docs
                usage_metadata: {
                  input_tokens: estimatedInputTokens,
                  output_tokens: estimatedOutputTokens,
                  total_tokens: estimatedTotalTokens,
                  // Model information
                  ls_provider: 'anthropic',
                  ls_model_name: this.getNormalizedModelName(),
                  ls_model_type: 'chat',
                  // Flag that these are estimates
                  token_source: 'estimated',
                }
              },
              extra: {
                metadata: {
                  ls_provider: 'anthropic',
                  ls_model_name: this.getNormalizedModelName(),
                  ls_model_type: 'chat',
                  ls_stop_reason: stopReason,
                  is_tool_use: stopReason === "tool_use",
                  is_end_turn: stopReason === "end_turn",
                  is_max_tokens: stopReason === "max_tokens",
                }
              }
            });
            await llmRunTree.patchRun();
            
            log("🔗 [BedrockChat] Ended LLM run with estimated tokens", {
              llmRunTreeId: llmRunTree.id,
              modelName: this.getNormalizedModelName(),
              estimatedTokens: {
                input: estimatedInputTokens,
                output: estimatedOutputTokens,
                total: estimatedTotalTokens,
              },
              responseLength: fullResponseText.length,
            });
          }
        }
          
        // Usage tracking removed - data is sent to LangSmith only

        // Check if response was truncated due to max tokens
        if (stopReason === "max_tokens") {
          log("⚠️ [BedrockChat] Response truncated due to max tokens limit", {
            responseLength: fullResponseText.length,
            stopReason,
          });
          yield "\n\n[Response truncated due to length limit. Please ask me to continue or be more specific about what you'd like to know.]";
        }

        // Handle fake tool execution by retrying with stronger instructions
        if (fakeToolExecutionDetected && stopReason === "end_turn") {
          log("🔄 [BedrockChat] Retrying due to fake tool execution", {
            originalStopReason: stopReason,
            recursionDepth: options.recursionDepth || 0
          });
          
          // Add a system message to force proper tool use
          const retryMessages = [...converseMessages];
          retryMessages.push(assistantMessage);
          retryMessages.push({
            role: "user",
            content: "I notice you tried to simulate tool results instead of actually executing tools. Please try again and use the actual tool functions provided. Do not make up or simulate tool results. Use the proper tool calling mechanism."
          });
          
          // Retry once with stronger instructions
          const retryOptions = { 
            ...options,
            recursionDepth: (options.recursionDepth || 0) + 1,
            traceHeaders: options.traceHeaders,
            enableCaching: options.enableCaching
          };
          
          try {
            for await (const chunk of this._createChatCompletion(
              retryMessages.map(m => ({ 
                role: m.role, 
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) 
              })), 
              retryOptions
            )) {
              yield chunk;
            }
            return; // Exit after retry
          } catch (retryError) {
            err("❌ [BedrockChat] Retry after fake tool execution failed", {
              error: retryError instanceof Error ? retryError.message : String(retryError)
            });
            yield "\n\nI apologize, but I'm having trouble accessing the tools needed to answer your question. Please try rephrasing your request or asking a different question.";
            return;
          }
        }
        
        // AWS Documentation: Handle tool use
        if (stopReason === "tool_use") {
          const toolCalls = assistantMessage.content.filter(c => c.toolUse);
          log("🛠️ [BedrockChat] Tool use detected, preparing to execute tools", {
            toolCallCount: toolCalls.length,
            toolNames: toolCalls.map(c => c.toolUse?.name),
            stopReason,
            recursionDepth: options.recursionDepth || 0,
            maxRecursionDepth: backendConfig.rag.BEDROCK_MAX_TOOL_RECURSION_DEPTH || 1,
          });
          
          yield "\n\n[Executing tools...]\n";
          
          // Track recursion depth to prevent infinite loops
          // This allows the LLM to execute tools once, then execute follow-up tools once more
          // Example: get_system_nodes -> get_system_vitals (depth 0 -> depth 1)
          const recursionDepth = options.recursionDepth || 0;
          const maxRecursionDepth = backendConfig.rag.BEDROCK_MAX_TOOL_RECURSION_DEPTH || 1; // Use configurable value
          
          if (recursionDepth >= maxRecursionDepth) {
            log("🚫 [BedrockChat] Maximum recursion depth reached, skipping tool execution", {
              recursionDepth,
              maxRecursionDepth,
            });
            yield `\n\n[Error: Tool execution limit reached. ${recursionDepth + 1} rounds of tools were requested but the limit is ${maxRecursionDepth} rounds. To allow more tool execution rounds, increase BEDROCK_MAX_TOOL_RECURSION_DEPTH in your environment configuration.]\n`;
            return;
          }

          const toolResults: ContentBlock[] = [];
          const toolExecutionStart = Date.now();
          let toolsExecuted = 0;
          const toolResultsForDisplay: string[] = []; // Store formatted results for display

          for (const content of assistantMessage.content) {
            if (content.toolUse) {
              const { toolUseId, name, input } = content.toolUse;
              toolsExecuted++;

              log("🔧 [Tool] Executing tool", {
                name,
                input: JSON.stringify(input).substring(0, 100) + "...",
                toolIndex: toolsExecuted,
              });

              const toolStart = Date.now();
              let result;

              // Execute tool with traceable wrapper for proper tracing
              let executeResult;
              try {
                executeResult = await this.executeToolInContext(name, input, parentRunTree);
              } catch (toolError) {
                err("❌ [Tool] Tool execution error", {
                  name,
                  error: toolError.message,
                });
                executeResult = {
                  success: false,
                  error: toolError.message,
                  content: `Tool execution failed: ${toolError.message}`,
                };
              }

              result = executeResult;

              const toolExecutionTime = Date.now() - toolStart;

              log("✅ [Tool] Tool execution complete", {
                name,
                success: result.success,
                executionTimeMs: toolExecutionTime,
                resultSize: result.data?.count || 0,
                toolIndex: toolsExecuted,
              });

              toolResults.push({
                toolResult: {
                  toolUseId,
                  content: [{ text: result.content || JSON.stringify(result) }],
                  status: result.success ? "success" : "error",
                },
              });
              
              // Store formatted result for display
              const resultDisplay = `\n### Tool: ${name}\n${result.content || JSON.stringify(result.data, null, 2)}`;
              toolResultsForDisplay.push(resultDisplay);
              
              // Add a prompt for analysis after the last tool
              if (toolsExecuted === toolCalls.length) {
                toolResults[toolResults.length - 1].toolResult.content[0].text += '\n\nNow provide your analysis of these results. What do they mean? Are there any issues? What are your recommendations?';
              }
            }
          }

          const totalToolExecutionTime = Date.now() - toolExecutionStart;

          log("🏁 [Tool] All tools executed", {
            toolsExecuted,
            totalExecutionTimeMs: totalToolExecutionTime,
            averageExecutionTimeMs: Math.round(
              totalToolExecutionTime / toolsExecuted,
            ),
            stopReason,
            recursionDepth: options.recursionDepth || 0,
          });
          
          // Display tool results to user
          if (toolResultsForDisplay.length > 0) {
            yield "\n" + toolResultsForDisplay.join("\n") + "\n";
          }

          // Continue conversation with tool results
          converseMessages.push(assistantMessage);
          converseMessages.push({
            role: "user",
            content: toolResults,
          });

          const continueCommand = new ConverseStreamCommand({
            modelId: this.modelId,
            messages: converseMessages,
            system: systemPromptBlocks.length > 0 ? systemPromptBlocks : undefined,
            toolConfig,
            inferenceConfig: {
              maxTokens: options.max_tokens || backendConfig.rag.BEDROCK_MAX_TOKENS,
              temperature: options.temperature || 0.3,
            },
          });

          const continueResponse = await this.client.send(continueCommand);

          if (continueResponse.stream) {
            let continuationStopReason = "";
            let continuationAssistantMessage: Message = { role: "assistant", content: [] };
            let continuationContentIndex = -1;
            
            for await (const event of continueResponse.stream) {
              if (event.contentBlockStart) {
                continuationContentIndex++;
                if (event.contentBlockStart.start?.toolUse) {
                  if (!continuationAssistantMessage.content) {
                    continuationAssistantMessage.content = [];
                  }
                  continuationAssistantMessage.content.push({
                    toolUse: {
                      toolUseId: event.contentBlockStart.start.toolUse.toolUseId || "",
                      name: event.contentBlockStart.start.toolUse.name || "",
                      input: {},
                    },
                  });
                } else {
                  if (!continuationAssistantMessage.content) {
                    continuationAssistantMessage.content = [];
                  }
                  continuationAssistantMessage.content.push({ text: "" });
                }
              } else if (event.contentBlockDelta?.delta) {
                if (event.contentBlockDelta.delta.text !== undefined) {
                  yield event.contentBlockDelta.delta.text;
                  fullResponseText += event.contentBlockDelta.delta.text;
                  
                  // Update text content
                  const content = continuationAssistantMessage.content[continuationContentIndex];
                  if (content && 'text' in content) {
                    content.text = (content.text || "") + event.contentBlockDelta.delta.text;
                  }
                } else if (event.contentBlockDelta.delta.toolUse?.input) {
                  // Accumulate tool input
                  const content = continuationAssistantMessage.content[continuationContentIndex];
                  if (content && content.toolUse) {
                    const inputChunk = event.contentBlockDelta.delta.toolUse.input;
                    
                    // Try to parse directly if it's a complete JSON
                    try {
                      const inputData = typeof inputChunk === 'string' ? JSON.parse(inputChunk) : inputChunk;
                      content.toolUse.input = inputData;
                    } catch (e) {
                      // Accumulate input if it's being streamed in parts
                      if (!(content.toolUse as any).inputBuffer) {
                        (content.toolUse as any).inputBuffer = "";
                      }
                      (content.toolUse as any).inputBuffer += inputChunk;
                      
                      try {
                        const parsedInput = JSON.parse((content.toolUse as any).inputBuffer);
                        content.toolUse.input = parsedInput;
                        delete (content.toolUse as any).inputBuffer;
                      } catch (e) {
                        // Still accumulating
                      }
                    }
                  }
                }
              } else if (event.messageStop) {
                continuationStopReason = event.messageStop.stopReason || "";
                
                // Check if response ended with an announcement but no tool execution
                
                log("🛑 [BedrockChat] Continuation MessageStop - Recursive response completed", {
                  stopReason: continuationStopReason,
                  isToolUse: continuationStopReason === "tool_use",
                  isEndTurn: continuationStopReason === "end_turn",
                  isMaxTokens: continuationStopReason === "max_tokens",
                  recursionDepth: options.recursionDepth || 0
                });
              } else if (event.metadata?.usage) {
                // Capture token usage from continuation
                tokenUsage = {
                  inputTokens: (tokenUsage?.inputTokens || 0) + (event.metadata.usage.inputTokens || 0),
                  outputTokens: (tokenUsage?.outputTokens || 0) + (event.metadata.usage.outputTokens || 0),
                  totalTokens: (tokenUsage?.totalTokens || 0) + (event.metadata.usage.totalTokens || 0),
                  timestamp: new Date().toISOString(),
                  model: this.modelId,
                  estimatedCost: 0, // Will calculate after
                };
              }
            }
            
            // Check if continuation response was truncated or abnormally short
            if (continuationStopReason === "max_tokens") {
              log("⚠️ [BedrockChat] Continuation response truncated due to max tokens limit", {
                continuationResponseLength: continuationFullResponse.length,
                continuationStopReason,
              });
              yield "\n\n⚠️ **Response was truncated due to token limit.** The large tool output consumed most of the available context. Please ask a more specific question or request a summary of specific parts.";
            } else if (continuationStopReason === "end_turn" && continueResponse.metadata?.usage?.outputTokens < 10) {
              // Detect when the model outputs very few tokens (like our 3-token case)
              log("⚠️ [BedrockChat] Abnormally short continuation response detected", {
                outputTokens: continueResponse.metadata?.usage?.outputTokens,
                inputTokens: continueResponse.metadata?.usage?.inputTokens,
                continuationResponseLength: continuationFullResponse.length,
                continuationStopReason,
              });
              
              const totalInputTokens = (tokenUsage?.inputTokens || 0) + (continueResponse.metadata?.usage?.inputTokens || 0);
              
              // Estimate if we're near context limit (typically 200k for Claude 3)
              const contextLimitEstimate = 200000; // Claude 3 context window
              const contextUsagePercent = Math.round((totalInputTokens / contextLimitEstimate) * 100);
              
              yield `\n\n⚠️ **The response was cut short** (only ${continueResponse.metadata?.usage?.outputTokens || 0} tokens generated). This typically happens when:\n`;
              yield `- The tool output was too large (${toolResultsForDisplay.join('').length} characters)\n`;
              yield `- Context window is nearly full (approximately ${contextUsagePercent}% used)\n`;
              yield `\n**Suggestions:**\n`;
              yield `- Ask for specific information from the tool results\n`;
              yield `- Request a summary of particular sections\n`;
              yield `- Start a new conversation for complex analyses\n`;
            }
            
            // Handle recursive tool use if continuation also requests tools
            if (continuationStopReason === "tool_use" && recursionDepth < maxRecursionDepth) {
              const additionalToolCalls = continuationAssistantMessage.content.filter(c => c.toolUse);
              log("🔄 [BedrockChat] Continuation requested additional tools, executing recursively", {
                toolCount: additionalToolCalls.length,
                recursionDepth,
                maxRecursionDepth,
                continuationStopReason,
              });
              
              // Recursively execute the additional tools
              yield "\n";
              const recursiveOptions = { 
                ...options, 
                recursionDepth: recursionDepth + 1,
                traceHeaders: options.traceHeaders, // Preserve trace headers
                enableCaching: options.enableCaching // Preserve caching option
              };
              
              // Convert messages to simple format for recursive call
              const recursiveMessages: Array<{ role: string; content: string }> = [];
              
              // Preserve system messages from original conversation
              const originalSystemMessages = messages.filter(m => m.role === "system");
              recursiveMessages.push(...originalSystemMessages);
              
              // Convert all Bedrock messages including the current conversation
              const allBedrockMessages = [...converseMessages, assistantMessage, { role: "user", content: toolResults }, continuationAssistantMessage];
              
              for (const msg of allBedrockMessages) {
                const simpleMsg = this.convertBedrockMessageToSimple(msg);
                if (simpleMsg.content.trim()) {
                  // Check if we already have this message to avoid duplicates
                  const lastMsg = recursiveMessages[recursiveMessages.length - 1];
                  if (!lastMsg || lastMsg.role !== simpleMsg.role || lastMsg.content !== simpleMsg.content) {
                    recursiveMessages.push(simpleMsg);
                  }
                }
              }
              
              log("🔄 [BedrockChat] Executing recursive tool call", {
                recursionDepth: recursionDepth + 1,
                messageCount: recursiveMessages.length,
                lastMessage: recursiveMessages[recursiveMessages.length - 1],
                toolResultCount: toolResults.length,
                continuationToolCount: continuationAssistantMessage.content.filter(c => c.toolUse).length
              });
              
              // Execute the recursive call with simple format messages
              try {
                for await (const chunk of this._createChatCompletion(recursiveMessages, recursiveOptions)) {
                  yield chunk;
                }
              } catch (recursiveError) {
                err("❌ [BedrockChat] Recursive tool execution failed", {
                  error: recursiveError instanceof Error ? recursiveError.message : String(recursiveError),
                  recursionDepth: recursionDepth + 1,
                  messageCount: recursiveMessages.length
                });
                yield `\n\n[Error: Failed to execute additional tools. ${recursiveError instanceof Error ? recursiveError.message : 'Unknown error'}]\n`;
              }
            } else if (continuationStopReason === "tool_use") {
              log("🚫 [BedrockChat] Recursion depth exceeded, preventing infinite loop", {
                recursionDepth,
                maxRecursionDepth,
              });
              yield `\n\n[Error: Tool execution limit reached. Additional tools were requested but the limit is ${maxRecursionDepth} rounds. To allow more tool execution rounds, increase BEDROCK_MAX_TOOL_RECURSION_DEPTH in your environment configuration.]\n`;
            }
            
            // Extract token usage from continuation response metadata
            if (continueResponse.metadata?.usage) {
              const continueTokenUsage: TokenUsage = {
                inputTokens: continueResponse.metadata.usage.inputTokens || 0,
                outputTokens: continueResponse.metadata.usage.outputTokens || 0,
                totalTokens: continueResponse.metadata.usage.totalTokens || (continueResponse.metadata.usage.inputTokens || 0) + (continueResponse.metadata.usage.outputTokens || 0),
                model: this.modelId,
                timestamp: new Date().toISOString(),
                cacheReadTokens: continueResponse.metadata.usage.cacheReadInputTokens || 0,
                cacheWriteTokens: continueResponse.metadata.usage.cacheWriteInputTokens || 0,
              };
              continueTokenUsage.estimatedCost = calculateCost(continueTokenUsage);
              
              // Aggregate token usage from both initial and continuation responses
              if (tokenUsage) {
                tokenUsage.inputTokens += continueTokenUsage.inputTokens;
                tokenUsage.outputTokens += continueTokenUsage.outputTokens;
                tokenUsage.totalTokens += continueTokenUsage.totalTokens;
                tokenUsage.estimatedCost! += continueTokenUsage.estimatedCost!;
                tokenUsage.cacheReadTokens = (tokenUsage.cacheReadTokens || 0) + continueTokenUsage.cacheReadTokens;
                tokenUsage.cacheWriteTokens = (tokenUsage.cacheWriteTokens || 0) + continueTokenUsage.cacheWriteTokens;
                
                log("📊 [BedrockChat] Aggregated token usage after tool execution", {
                  totalInputTokens: tokenUsage.inputTokens,
                  totalOutputTokens: tokenUsage.outputTokens,
                  totalTokens: tokenUsage.totalTokens,
                  totalCost: tokenUsage.estimatedCost,
                  totalCacheReadTokens: tokenUsage.cacheReadTokens || 0,
                  totalCacheWriteTokens: tokenUsage.cacheWriteTokens || 0,
                });
                
                // Update trace with aggregated usage using LangSmith metadata format
                if (parentRunTree) {
                  // Set token counts at root level of metadata as per LangSmith docs
                  parentRunTree.extra = {
                    ...parentRunTree.extra,
                    metadata: {
                      ...parentRunTree.extra?.metadata,
                      // Token counts at root level for LangSmith cost calculation
                      input_tokens: tokenUsage.inputTokens,
                      output_tokens: tokenUsage.outputTokens,
                      total_tokens: tokenUsage.totalTokens,
                      // Optional token details (aggregated from all tool calls)
                      input_token_details: {
                        cache_write: tokenUsage.cacheWriteTokens || 0,
                        cache_read: tokenUsage.cacheReadTokens || 0
                      },
                      output_token_details: {},
                      // Model information
                      ls_provider: 'anthropic',
                      ls_model_name: this.modelId,
                      ls_model_type: 'chat',
                      // Additional cost information
                      total_cost: tokenUsage.estimatedCost,
                      // Tool execution metadata
                      tools_executed: toolsExecuted,
                      tool_execution_time_ms: totalToolExecutionTime,
                    },
                    // Also keep legacy fields for debugging
                    tokenUsage,
                    llmCost: tokenUsage.estimatedCost,
                    model: this.modelId,
                  };
                }
                
                // Usage tracking removed - data is sent to LangSmith only
              }
            }
          }
        }
      } catch (streamError) {
        log("⚠️ [BedrockChat] Stream processing warning:", {
          error: streamError.message,
        });
      }
    } catch (error) {
      err(
        "❌ [BedrockChat] Failed to create chat completion with Converse API",
        {
          modelId: this.modelId,
          error: error.message,
        },
      );
      throw error;
    }
  }


  // Public method - no traceable wrapper to allow inheritance from parent trace
  createChatCompletion = (
    messages: Array<{ role: string; content: string }>,
    options: { 
      temperature?: number; 
      max_tokens?: number; 
      traceHeaders?: Record<string, string>;
      userId?: string;
      sessionId?: string;
      conversationId?: string;
      recursionDepth?: number;
      enableCaching?: boolean;
    } = {},
  ) => {
    return this._createChatCompletion(messages, options);
  };

  // Function to get model information
  getModelInfo() {
    return {
      provider: "AWS Bedrock",
      model: this.modelId,
    };
  }

  // Test global connection
  async testConnection() {
    log("🧪 [BedrockChat] Testing global connection");
    const cluster = await clusterConn();
    const result = await cluster.query("SELECT 1 as test");
    const rows = await result.rows;
    log("✅ [BedrockChat] Connection test successful", { testResult: rows[0] });
    return rows[0];
  }

  // OpenAI-compatible interface for easy migration
  get chat() {
    return {
      completions: {
        create: (options: {
          model: string;
          messages: Array<{ role: string; content: string }>;
          temperature?: number;
          max_tokens?: number;
          stream?: boolean;
        }) => {
          if (!options.stream) {
            throw new Error("Non-streaming chat completions not yet supported");
          }

          return this.createChatCompletion(options.messages, {
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens,
          });
        },
      },
    };
  }
  
  // Utility method to check if model supports caching
  supportsPromptCaching(): boolean {
    return Object.keys(this.MIN_CACHE_TOKENS).includes(this.modelId);
  }

  // Method to get cache performance stats
  getCacheConfig() {
    return {
      supported: this.supportsPromptCaching(),
      minTokens: this.MIN_CACHE_TOKENS[this.modelId] || 1024,
      cacheType: this.CACHE_CONFIG.type,
      model: this.modelId,
    };
  }
}
