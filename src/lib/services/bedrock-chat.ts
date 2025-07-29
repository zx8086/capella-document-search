/* src/lib/services/bedrock-chat.ts */

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  ConverseCommand,
  type Tool,
  type ToolConfiguration,
  type Message,
  type ContentBlock,
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
// import { usageTracker } from "./usage-tracking"; // Removed - using LangSmith only

// Token usage interface for type safety
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  timestamp: string;
  estimatedCost?: number;
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

const getSystemVitalsTool: Tool = {
  toolSpec: {
    name: "get_system_vitals",
    description:
      "Get detailed system vitals and performance metrics for the Couchbase cluster including CPU, memory, disk usage, and operational metrics",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          node_filter: {
            type: "string",
            description:
              "Optional filter by node name (e.g., 'node1.example.com:8091'). If not provided, returns vitals for all nodes.",
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
      "Get information about all nodes in the Couchbase cluster including their services, status, and configuration",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          service_filter: {
            type: "string",
            description:
              "Optional filter by service type (e.g., 'n1ql', 'kv', 'index', 'fts'). If not provided, returns all nodes.",
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
      "Find queries that have FAILED, TIMED OUT, or caused ERRORS. Critical for identifying stability issues, query failures, and operational problems. Use this to diagnose query errors and failures.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month", "quarter"],
            description:
              "Time period to analyze (day, week, month, quarter). Defaults to week if not specified.",
          },
          limit: {
            type: "number",
            description:
              "Optional limit for the number of results to return. If not specified, returns all results.",
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
      "Get the most expensive queries based on execution time and resource usage",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
            default: 5,
          },
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Time period to analyze (day, week, month).",
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
    description: "Identify queries with longest execution times",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "View most commonly executed queries",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "Identify queries with largest result sizes",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "Find queries returning the most results",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "Identify queries using primary indexes",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "List all system indexes",
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
    description: "View completed query requests",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "List all prepared statements",
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
    description: "Identify unused or redundant indexes",
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
    description: "Get comprehensive information about database indexes",
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
    description: "View detailed information about prepared statements",
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
      "Get the structure and schema for a specific collection by sampling a document",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          scope_name: {
            type: "string",
            description: "Name of the scope containing the collection",
          },
          collection_name: {
            type: "string",
            description: "Name of the collection to analyze",
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
      "Execute SQL++ queries on a specified scope. Use only collection names in FROM clauses when using scope context.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          scope_name: {
            type: "string",
            description: "Name of the scope to execute the query in",
          },
          query: {
            type: "string",
            description:
              "SQL++ query to execute. Use only the collection name in the FROM clause if using scope context (e.g., SELECT * FROM `_default` NOT FROM `bucket`.`scope`.`collection`)",
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
  
  // Simple token estimation for when AWS doesn't provide counts
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is a simplified approximation for Claude models
    return Math.ceil(text.length / 4);
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

  private executeToolInContext = async (name: string, input: any, parentRunTree?: RunTree): Promise<any> => {
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
      inputKeys: Object.keys(input || {}),
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
        return await executeSpecificTool(name, input);
      });
    } else {
      log("⚠️ [Tool] No parent trace context available, executing directly", {
        toolName: name,
      });
      
      return await executeSpecificTool(name, input);
    }
  };

  private executeGetSystemVitals = async (
    node_filter?: string,
  ): Promise<any> => {
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
        query = query.replace(
          "SELECT * FROM system:vitals;",
          `SELECT * FROM system:vitals WHERE node LIKE "%${node_filter}%";`,
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

  private executeGetSystemIndexes = async (): Promise<any> => {
    try {
      log("🔍 [Tool] Executing get_system_indexes");
      const startTime = Date.now();
      const cluster = await clusterConn();

      const result = await cluster.query(n1qlSystemIndexes);
      const rows = await result.rows;
      const executionTime = Date.now() - startTime;

      const responseText =
        `# System Indexes (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No system indexes found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
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

      const responseText =
        `# Prepared Statements (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No prepared statements found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
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

      const responseText =
        `# Detailed Indexes (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No indexes found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
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

      const responseText =
        `# Detailed Prepared Statements (${rows.length} result${rows.length !== 1 ? "s" : ""})\n\n` +
        (rows.length === 0
          ? "No prepared statements found."
          : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length, executionTimeMs: executionTime },
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
      
      // Add tool selection guidance for performance analysis
      const performanceToolGuidance = `
## Tool Selection Guidelines for Performance Analysis

When analyzing cluster performance issues:

1. **ALWAYS START** with get_system_vitals to understand the current cluster state
2. **FOR SLOW QUERIES**: Use get_most_expensive_queries as it provides comprehensive timing metrics:
   - Detailed execution times (elapsed, service, run time)
   - Phase-by-phase performance breakdown (index scan, project, stream)
   - Resource usage metrics
   - Both average and total time spent
3. **AVOID REDUNDANCY**: Do not call get_longest_running_queries if you've already called get_most_expensive_queries
4. **FOR ERRORS**: Use get_fatal_requests to identify failed or timed-out queries
5. **FOR OPTIMIZATION**: Use get_most_frequent_queries to find high-volume queries that may benefit from optimization

## Important: Announce tool usage accurately
- Only announce tools you are actually about to execute
- If you change your mind about which tool to use, explain why
- Do not announce one tool and then execute a different one

## CRITICAL: Analyze Tool Results
After executing ANY tool, you MUST:
1. **ANALYZE THE DATA**: Don't just display raw results - provide meaningful insights
2. **IDENTIFY KEY METRICS**: Highlight important findings (e.g., high CPU, memory issues, slow queries)
3. **PROVIDE RECOMMENDATIONS**: Based on the data, suggest improvements or next steps
4. **CONTINUE ANALYSIS**: If you announced additional checks, execute them after analyzing current results

## CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
- **COMPLETE YOUR ANALYSIS**: When analyzing performance issues, you MUST check:
  1. System vitals (get_system_vitals)
  2. Failed queries (get_fatal_requests)
  3. Expensive/slow queries (get_most_expensive_queries)
  4. Provide a comprehensive analysis based on ALL data gathered
- **NEVER ANNOUNCE WITHOUT EXECUTING**: If you say "Let me check...", "Let me also...", "Now let's examine...", or ANY similar phrase, you MUST execute the corresponding tool immediately
- **DO NOT END PREMATURELY**: If you announce an action, you MUST complete it before ending your response
- **FOLLOW THROUGH**: Once you start a performance analysis, complete it by executing all necessary tools
- **NO PARTIAL RESPONSES**: Never end your response after announcing a next step - always execute what you announce

IMPORTANT: The system will mark your response as incomplete if you announce an action without executing it.

## Response Control Rules:
- **CONTINUE AFTER ANNOUNCEMENTS**: When you write phrases like "Let me check...", "Let me also verify...", etc., you are REQUIRED to continue your response and execute the announced action
- **NO PREMATURE ENDINGS**: Do not use end_turn or stop generating after announcing an action
- **COMPLETE ALL STEPS**: If you outline multiple steps, execute ALL of them before ending your response
- **TOOL EXECUTION IS MANDATORY**: Once you announce a tool, its execution is not optional

## Common Mistake to AVOID:
DO NOT end your response after writing phrases like:
- "Now, let me check if there are any failed queries..."
- "Let me also verify..."
- "I'll analyze..."
- "Next, I'll examine..."

These phrases REQUIRE immediate tool execution. Ending without executing is a critical error.`;
      
      const systemPrompt = baseSystemPrompt ? baseSystemPrompt + performanceToolGuidance : performanceToolGuidance;

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

      // Create the ConverseStream command
      const command = new ConverseStreamCommand({
        modelId: this.modelId,
        messages: converseMessages,
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        toolConfig,
        inferenceConfig: {
          maxTokens: options.max_tokens || backendConfig.rag.BEDROCK_MAX_TOKENS,
          temperature: options.temperature || 0.7,
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
        hasSystem: !!systemPrompt,
        toolsEnabled: true,
        toolCount: this.tools.length,
        availableTools: this.tools.map(t => t.toolSpec.name),
        hasLLMRunTree: !!llmRunTree,
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
              
              if (event.metadata.usage) {
                tokenUsage = {
                  inputTokens: event.metadata.usage.inputTokens || event.metadata.usage.input_tokens || 0,
                  outputTokens: event.metadata.usage.outputTokens || event.metadata.usage.output_tokens || 0,
                  totalTokens: 0, // Will be calculated below
                  model: this.modelId,
                  timestamp: new Date().toISOString(),
                };
                tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
                tokenUsage.estimatedCost = calculateCost(tokenUsage);
                
                log("📊 [BedrockChat] Token usage extracted from metadata event", {
                  inputTokens: tokenUsage.inputTokens,
                  outputTokens: tokenUsage.outputTokens,
                  totalTokens: tokenUsage.totalTokens,
                  estimatedCost: tokenUsage.estimatedCost,
                });
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
                    cache_creation: usageData.cacheWriteInputTokens || 0,
                    cache_read: usageData.cacheReadInputTokens || 0
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

        // AWS Documentation: Handle tool use
        if (stopReason === "tool_use") {
          const toolCalls = assistantMessage.content.filter(c => c.toolUse);
          log("🛠️ [BedrockChat] Tool use detected, preparing to execute tools", {
            toolCallCount: toolCalls.length,
            toolNames: toolCalls.map(c => c.toolUse?.name),
            stopReason,
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

              // Add analysis instruction with the tool results
              const analysisPrompt = toolsExecuted === 1 && name === "get_system_vitals" 
                ? "\n\nBased on this system vitals data, analyze the cluster's performance and identify any issues or concerns. Then proceed with additional checks as needed."
                : "";
              
              toolResults.push({
                toolResult: {
                  toolUseId,
                  content: [{ text: (result.content || JSON.stringify(result)) + analysisPrompt }],
                  status: result.success ? "success" : "error",
                },
              });
              
              // Store formatted result for display
              toolResultsForDisplay.push(`\n### Tool: ${name}\n${result.content || JSON.stringify(result.data, null, 2)}`);
            }
          }

          const totalToolExecutionTime = Date.now() - toolExecutionStart;

          log("🏁 [Tool] All tools executed", {
            toolsExecuted,
            totalExecutionTimeMs: totalToolExecutionTime,
            averageExecutionTimeMs: Math.round(
              totalToolExecutionTime / toolsExecuted,
            ),
          });
          
          // Display tool results to user
          if (toolResultsForDisplay.length > 0) {
            yield "\n" + toolResultsForDisplay.join("\n") + "\n";
          }

          // Continue conversation with tool results
          converseMessages.push(assistantMessage);
          
          // Add explicit instruction if the last response announced an action
          let toolResultsWithInstruction = toolResults;
          const lastAssistantText = fullResponseText || "";
          
          // Check if the response ends with an announcement pattern
          const announcementPatterns = [
            /let me (?:also )?(?:check|verify|analyze|examine|look|investigate|assess)/i,
            /now,? (?:let's|let me|I'll|I will)/i,
            /I(?:'ll| will) (?:also )?(?:check|verify|analyze|examine|look)/i,
            /(?:Next|Additionally|Furthermore), (?:let me|I'll|I will)/i
          ];
          
          const endsWithAnnouncement = announcementPatterns.some(pattern => 
            pattern.test(lastAssistantText.trim().slice(-200)) // Check last 200 chars
          );
          
          if (endsWithAnnouncement) {
            // toolResults is an array of ContentBlock objects, not messages
            // Add the instruction as an additional text block
            toolResultsWithInstruction = [
              ...toolResults,
              { text: "\n\nIMPORTANT: Your previous response ended with an announcement of an action. You MUST now execute that announced action using the appropriate tool. Do not end your response without executing the tool you just announced." }
            ];
            
            log("⚠️ [BedrockChat] Detected announcement pattern, adding execution instruction", {
              lastText: lastAssistantText.slice(-200),
              patternMatched: true
            });
          }
          
          converseMessages.push({
            role: "user",
            content: toolResultsWithInstruction,
          });

          const continueCommand = new ConverseStreamCommand({
            modelId: this.modelId,
            messages: converseMessages,
            system: systemPrompt ? [{ text: systemPrompt }] : undefined,
            toolConfig,
            inferenceConfig: {
              maxTokens: options.max_tokens || backendConfig.rag.BEDROCK_MAX_TOKENS,
              temperature: options.temperature || 0.7,
              // Increase stop sequences to encourage completion of announced actions
              stopSequences: [], // Empty to prevent premature stopping
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
                const responseText = continuationAssistantMessage.content
                  .filter(c => c.text)
                  .map(c => c.text)
                  .join("");
                  
                const announcementPatterns = [
                  /let me (?:also )?(?:check|verify|analyze|examine|look|investigate|assess)[^.]*[:.]?\s*$/i,
                  /now,? (?:let's|let me|I'll|I will)[^.]*[:.]?\s*$/i,
                  /I(?:'ll| will) (?:also )?(?:check|verify|analyze|examine|look)[^.]*[:.]?\s*$/i
                ];
                
                const hasAnnouncement = announcementPatterns.some(pattern => 
                  pattern.test(responseText.trim())
                );
                
                const hasTools = continuationAssistantMessage.content.some(c => c.toolUse);
                
                if (hasAnnouncement && !hasTools && continuationStopReason === "end_turn") {
                  log("❌ [BedrockChat] CRITICAL ERROR: Response ended with announcement but no tool execution", {
                    responsePreview: responseText.slice(-200),
                    stopReason: continuationStopReason,
                    hasAnnouncement,
                    hasTools
                  });
                  
                  // Force an error message to the user
                  yield "\n\n⚠️ **System Notice**: The response ended prematurely. The announced action was not executed. Please ask me to continue or try your question again.";
                }
                
                log("🛑 [BedrockChat] Continuation MessageStop - Recursive response completed", {
                  stopReason: continuationStopReason,
                  isToolUse: continuationStopReason === "tool_use",
                  isEndTurn: continuationStopReason === "end_turn",
                  isMaxTokens: continuationStopReason === "max_tokens",
                  recursionDepth: options.recursionDepth || 0,
                  responseEndsWithAnnouncement: hasAnnouncement,
                  hasToolExecution: hasTools
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
            
            
            // Handle recursive tool use if continuation also requests tools
            if (continuationStopReason === "tool_use" && recursionDepth < maxRecursionDepth) {
              const additionalToolCalls = continuationAssistantMessage.content.filter(c => c.toolUse);
              log("🔄 [BedrockChat] Continuation requested additional tools, executing recursively", {
                toolCount: additionalToolCalls.length,
                recursionDepth,
                maxRecursionDepth,
              });
              
              // Recursively execute the additional tools
              yield "\n";
              const recursiveOptions = { 
                ...options, 
                recursionDepth: recursionDepth + 1,
                traceHeaders: options.traceHeaders // Preserve trace headers
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
              };
              continueTokenUsage.estimatedCost = calculateCost(continueTokenUsage);
              
              // Aggregate token usage from both initial and continuation responses
              if (tokenUsage) {
                tokenUsage.inputTokens += continueTokenUsage.inputTokens;
                tokenUsage.outputTokens += continueTokenUsage.outputTokens;
                tokenUsage.totalTokens += continueTokenUsage.totalTokens;
                tokenUsage.estimatedCost! += continueTokenUsage.estimatedCost!;
                
                log("📊 [BedrockChat] Aggregated token usage after tool execution", {
                  totalInputTokens: tokenUsage.inputTokens,
                  totalOutputTokens: tokenUsage.outputTokens,
                  totalTokens: tokenUsage.totalTokens,
                  totalCost: tokenUsage.estimatedCost,
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
                        cache_creation: 0,
                        cache_read: 0
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
            temperature: options.temperature,
            max_tokens: options.max_tokens,
          });
        },
      },
    };
  }
}
