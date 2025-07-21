/* src/lib/services/bedrock-chat.ts */

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Tool,
  type ToolConfiguration,
  type Message,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { log, err } from '$utils/unifiedLogger';
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
  detailedIndexesQuery
} from '../../tools/queryAnalysis/analysisQueries';
import { clusterConn } from '$lib/couchbaseConnector';
import { backendConfig } from '../../backend-config';

// AWS Documentation: Correct tool definition matching docs exactly
const getSystemVitalsTool: Tool = {
  toolSpec: {
    name: "get_system_vitals",
    description: "Get detailed system vitals and performance metrics for the Couchbase cluster including CPU, memory, disk usage, and operational metrics",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          node_filter: {
            type: "string",
            description: "Optional filter by node name (e.g., 'node1.example.com:8091'). If not provided, returns vitals for all nodes.",
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
    description: "Get information about all nodes in the Couchbase cluster including their services, status, and configuration",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          service_filter: {
            type: "string",
            description: "Optional filter by service type (e.g., 'n1ql', 'kv', 'index', 'fts'). If not provided, returns all nodes.",
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
    description: "Get information about failed/fatal N1QL queries including error details and performance metrics",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month", "quarter"],
            description: "Time period to analyze (day, week, month, quarter). Defaults to week if not specified.",
          },
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return. If not specified, returns all results.",
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
    description: "Get the most expensive queries based on execution time and resource usage",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Optional limit for the number of results to return.",
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
    description: "Get the structure and schema for a specific collection by sampling a document",
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
    description: "Execute SQL++ queries on a specified scope. Use only collection names in FROM clauses when using scope context.",
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
            description: "SQL++ query to execute. Use only the collection name in the FROM clause if using scope context (e.g., SELECT * FROM `_default` NOT FROM `bucket`.`scope`.`collection`)",
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
    runSqlPlusPlusQueryTool
  ];

  constructor(region: string = "eu-central-1") {
    log('🔧 [BedrockChat] Constructor called', { 
      region,
      approach: 'using global connection'
    });
    // Build credentials object safely
    const credentials: any = {
      accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || "DUMMY",
      secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || "DUMMY",
    };
    
    // Only add sessionToken if it exists and is not empty
    if (Bun.env.AWS_BEARER_TOKEN_BEDROCK && Bun.env.AWS_BEARER_TOKEN_BEDROCK.trim()) {
      credentials.sessionToken = Bun.env.AWS_BEARER_TOKEN_BEDROCK;
    }
    
    this.client = new BedrockRuntimeClient({
      region,
      credentials,
      // Use maxAttempts to handle transient network issues
      maxAttempts: 3,
      // Add retry configuration
      retryMode: 'adaptive',
      // Use HTTP/1.1 handler to avoid Bun HTTP/2 compatibility issues
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false }
      })
    });
    this.modelId = Bun.env.BEDROCK_CHAT_MODEL || "eu.amazon.nova-pro-v1:0";
  }

  private async executeGetSystemVitals(node_filter?: string): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_system_vitals', { 
        node_filter,
        approach: 'using global connection'
      });
      
      // Use the global connection approach (same as test endpoint)
      log('🔍 [Tool] Getting cluster connection...');
      const cluster = await clusterConn();
      
      log('✅ [Tool] Got cluster, building query');

      // Build the query based on parameters
      let query = systemVitalsQuery;
      
      // Apply node filter if specified
      if (node_filter) {
        query = query.replace(
          "SELECT * FROM system:vitals;",
          `SELECT * FROM system:vitals WHERE node LIKE "%${node_filter}%";`
        );
      }

      log('📝 [Tool] Executing query', { query: query.substring(0, 100) + '...' });

      // Execute the query directly through the cluster (same as test endpoint)
      const result = await cluster.query(query);
      
      log('✅ [Tool] Query executed, processing results');
      const rows = await result.rows;
      
      log('📊 [Tool] Query results', { rowCount: rows.length });

      // Format the response
      const responseText = `# Couchbase System Vitals (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No results found for this query." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length }
      };
    } catch (error) {
      err('❌ [Tool] Get system vitals failed', { error: error.message });
      return { 
        success: false,
        error: error.message,
        content: `System vitals query failed: ${error.message}`
      };
    }
  }

  private async executeGetSystemNodes(service_filter?: string): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_system_nodes', { 
        service_filter,
        approach: 'using global connection'
      });
      
      // Use the global connection approach
      const cluster = await clusterConn();
      
      // Build the query based on parameters
      let query = systemNodesQuery;
      
      // Apply service filter if specified
      if (service_filter) {
        query = query.replace(
          "SELECT * FROM system:nodes;",
          `SELECT * FROM system:nodes WHERE ANY s IN services SATISFIES s = "${service_filter}" END;`
        );
      }

      log('📝 [Tool] Executing nodes query', { query: query.substring(0, 100) + '...' });

      // Execute the query
      const result = await cluster.query(query);
      const rows = await result.rows;
      
      log('📊 [Tool] Nodes query results', { rowCount: rows.length });

      // Format the response
      const responseText = `# Couchbase Cluster Nodes (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No results found for this query." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length }
      };
    } catch (error) {
      err('❌ [Tool] Get system nodes failed', { error: error.message });
      return { 
        success: false,
        error: error.message,
        content: `System nodes query failed: ${error.message}`
      };
    }
  }

  private async executeGetFatalRequests(period?: string, limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_fatal_requests', { 
        period,
        limit,
        approach: 'using global connection'
      });
      
      // Use the global connection approach
      const cluster = await clusterConn();
      
      // Build the query based on parameters
      let query = n1qlQueryFatalRequests;
      
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
        
        // Replace the DATE_ADD_STR period in the query
        query = query.replace(
          /DATE_ADD_STR\(NOW_STR\(\), -\d+, '\w+'\)/,
          `DATE_ADD_STR(NOW_STR(), -${periodValue}, '${periodUnit}')`
        );
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        // Add limit to the end of the query
        query = query.replace(
          "ORDER BY requestTime DESC;",
          `ORDER BY requestTime DESC LIMIT ${limit};`
        );
      }

      log('📝 [Tool] Executing fatal requests query', { query: query.substring(0, 100) + '...' });

      // Execute the query
      const result = await cluster.query(query);
      const rows = await result.rows;
      
      log('📊 [Tool] Fatal requests query results', { rowCount: rows.length });

      // Format the response
      const responseText = `# Fatal Query Requests (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No fatal requests found for the specified period." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length }
      };
    } catch (error) {
      err('❌ [Tool] Get fatal requests failed', { error: error.message });
      return { 
        success: false,
        error: error.message,
        content: `Fatal requests query failed: ${error.message}`
      };
    }
  }

  private async executeGetMostExpensiveQueries(limit?: number, period?: string): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_most_expensive_queries', { limit, period });
      const cluster = await clusterConn();
      
      let query = mostExpensiveQueries;
      
      if (period) {
        let periodClause: string;
        switch (period) {
          case "day":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'day')";
            break;
          case "week":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
            break;
          case "month":
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'month')";
            break;
          default:
            periodClause = "requestTime >= DATE_ADD_STR(NOW_STR(), -1, 'week')";
        }
        query = query.replace("WHERE LOWER(statement)", `WHERE ${periodClause} AND LOWER(statement)`);
      }
      
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Most Expensive Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No expensive queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get most expensive queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetLongestRunningQueries(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_longest_running_queries', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlLongestRunningQueries;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Longest Running Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get longest running queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetMostFrequentQueries(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_most_frequent_queries', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlMostFrequentQueries;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Most Frequent Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get most frequent queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetLargestResultSizeQueries(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_largest_result_size_queries', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlLargestResultSizeQueries;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Largest Result Size Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get largest result size queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetLargestResultCountQueries(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_largest_result_count_queries', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlLargestResultCountQueries;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Largest Result Count Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get largest result count queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetPrimaryIndexQueries(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_primary_index_queries', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlPrimaryIndexes;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Primary Index Queries (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No primary index queries found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get primary index queries failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetSystemIndexes(): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_system_indexes');
      const cluster = await clusterConn();
      
      const result = await cluster.query(n1qlSystemIndexes);
      const rows = await result.rows;
      
      const responseText = `# System Indexes (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No system indexes found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get system indexes failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetCompletedRequests(limit?: number): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_completed_requests', { limit });
      const cluster = await clusterConn();
      
      let query = n1qlCompletedRequests;
      if (limit && limit > 0) {
        query = query.replace(/;\s*$/, ` LIMIT ${limit};`);
      }

      const result = await cluster.query(query);
      const rows = await result.rows;
      
      const responseText = `# Completed Requests (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No completed requests found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get completed requests failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetPreparedStatements(): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_prepared_statements');
      const cluster = await clusterConn();
      
      const result = await cluster.query(n1qlPreparedStatements);
      const rows = await result.rows;
      
      const responseText = `# Prepared Statements (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No prepared statements found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get prepared statements failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetIndexesToDrop(): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_indexes_to_drop');
      const cluster = await clusterConn();
      
      const result = await cluster.query(n1qlIndexesToDrop);
      const rows = await result.rows;
      
      const responseText = `# Indexes to Drop (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No unused indexes found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get indexes to drop failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetDetailedIndexes(): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_detailed_indexes');
      const cluster = await clusterConn();
      
      const result = await cluster.query(detailedIndexesQuery);
      const rows = await result.rows;
      
      const responseText = `# Detailed Indexes (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No indexes found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get detailed indexes failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetDetailedPreparedStatements(): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_detailed_prepared_statements');
      const cluster = await clusterConn();
      
      const result = await cluster.query(detailedPreparedStatementsQuery);
      const rows = await result.rows;
      
      const responseText = `# Detailed Prepared Statements (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        (rows.length === 0 ? "No prepared statements found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return { success: true, content: responseText, data: { rows, count: rows.length } };
    } catch (error) {
      err('❌ [Tool] Get detailed prepared statements failed', { error: error.message });
      return { success: false, error: error.message, content: `Query failed: ${error.message}` };
    }
  }

  private async executeGetSchemaForCollection(scope_name: string, collection_name: string): Promise<any> {
    try {
      log('🔍 [Tool] Executing get_schema_for_collection', { scope_name, collection_name });
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
          content: `❌ Error: Scope "${scope_name}" does not exist`
        };
      }
      
      const foundCollection = foundScope.collections.find((c) => c.name === collection_name);
      if (!foundCollection) {
        return {
          success: false,
          error: `Collection "${collection_name}" does not exist in scope "${scope_name}"`,
          content: `❌ Error: Collection "${collection_name}" does not exist in scope "${scope_name}"`
        };
      }

      // Sample a document to infer schema
      const result = await bucket.scope(scope_name).query("SELECT * FROM `" + collection_name + "` LIMIT 1");
      const rows = await result.rows;

      if (rows.length === 0) {
        return {
          success: true,
          content: "❌ No documents found in collection to infer schema",
          data: { rows: [], count: 0 }
        };
      }

      // Format schema
      const formatSchema = (doc: any): string => {
        let formattedText = "📋 Collection Schema:\n\n";
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
              fieldText += "\n" + Object.entries(value as object)
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
        data: { rows: [rows[0]], count: 1 }
      };
    } catch (error) {
      if (error.message && error.message.includes("index")) {
        return {
          success: false,
          error: "Index failure",
          content: "❌ Database error: index failure. Please create a primary index on this collection to enable schema inference. Example:\n\nCREATE PRIMARY INDEX ON `bucket`.`scope`.`collection`;"
        };
      }
      err('❌ [Tool] Get schema for collection failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `Schema query failed: ${error.message}`
      };
    }
  }

  private async executeRunSqlPlusPlusQuery(scope_name: string, query: string): Promise<any> {
    try {
      log('🔍 [Tool] Executing run_sql_plus_plus_query', { scope_name, query: query.substring(0, 100) + '...' });
      const cluster = await clusterConn();
      const bucket = cluster.bucket(backendConfig.capella.BUCKET);

      // Validate query doesn't use full bucket.scope.collection path
      if (/from\s+[`\w]+\.[`\w]+\.[`\w]+/i.test(query)) {
        return {
          success: false,
          error: "Invalid query format",
          content: "❌ Error: Query uses full bucket.scope.collection path. When using scope context, only use the collection name in the query. For example: SELECT COUNT(*) FROM `_default`"
        };
      }

      // Execute query in scope context
      const result = await bucket.scope(scope_name).query(query);
      const rows = await result.rows;

      // Handle special case for distinct_source_count
      if (rows.length === 1 && 'distinct_source_count' in rows[0]) {
        return {
          success: true,
          content: `Found ${rows[0].distinct_source_count} distinct sources`,
          data: { rows, count: rows.length }
        };
      }

      const responseText = `# SQL++ Query Results (${rows.length} result${rows.length !== 1 ? 's' : ''})\n\n` +
        `**Query:** \`${query}\`\n\n` +
        `**Scope:** \`${scope_name}\`\n\n` +
        (rows.length === 0 ? "No results found." : `\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\``);

      return {
        success: true,
        content: responseText,
        data: { rows, count: rows.length }
      };
    } catch (error) {
      err('❌ [Tool] Run SQL++ query failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        content: `SQL++ query failed: ${error.message}`
      };
    }
  }

  // Function to create a streaming chat completion using Converse API
  async *createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Separate system messages from conversation messages
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Combine system messages
      const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

      // Convert conversation messages to Converse API format
      const converseMessages: Message[] = conversationMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: [
          {
            text: msg.content
          }
        ]
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
          maxTokens: options.max_tokens || 8000,
          temperature: options.temperature || 0.7,
        },
      });

      log('🚀 [BedrockChat] Starting Converse stream', {
        modelId: this.modelId,
        messagesCount: converseMessages.length,
        hasSystem: !!systemPrompt
      });

      let response;
      try {
        response = await this.client.send(command);
      } catch (sendError) {
        // Check if this is the HTTP/2 destructuring issue
        if (sendError.message && sendError.message.includes('Right side of assignment cannot be destructured')) {
          err('❌ [BedrockChat] HTTP/2 destructuring issue during send', {
            modelId: this.modelId,
            error: sendError.message
          });
          yield '❌ Error: HTTP/2 compatibility issue with AWS SDK. Please try again.';
          return;
        }
        throw sendError;
      }

      if (!response.stream) {
        throw new Error('No response stream received from Bedrock Converse API');
      }

      // AWS Documentation: Handle both text and tool responses
      let assistantMessage: Message = { role: "assistant", content: [] };
      let currentContentIndex = -1;
      let stopReason = "";
      let chunkCount = 0;

      try {
        for await (const event of response.stream) {
          try {
            // Defensive check for $unknown property issues
            if (!event || typeof event !== 'object') {
              continue;
            }

            // Skip events with $unknown properties that cause parsing issues
            if ('$unknown' in event) {
              log('⚠️ [BedrockChat] Skipping $unknown event', { eventKeys: Object.keys(event) });
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

              if (delta?.text && assistantMessage.content[currentContentIndex]?.text !== undefined) {
                chunkCount++;
                yield delta.text;
                assistantMessage.content[currentContentIndex].text += delta.text;
              } else if (delta?.toolUse?.input && assistantMessage.content[currentContentIndex]?.toolUse) {
                try {
                  // Handle potential string vs object input
                  let inputData = delta.toolUse.input;
                  if (typeof inputData === 'string') {
                    inputData = JSON.parse(inputData);
                  }
                  assistantMessage.content[currentContentIndex].toolUse.input = inputData;
                } catch (e) {
                  // Accumulate input if it's being streamed in parts
                  if (!assistantMessage.content[currentContentIndex].toolUse.inputBuffer) {
                    assistantMessage.content[currentContentIndex].toolUse.inputBuffer = "";
                  }
                  assistantMessage.content[currentContentIndex].toolUse.inputBuffer += delta.toolUse.input;

                  try {
                    const parsedInput = JSON.parse(assistantMessage.content[currentContentIndex].toolUse.inputBuffer);
                    assistantMessage.content[currentContentIndex].toolUse.input = parsedInput;
                    delete assistantMessage.content[currentContentIndex].toolUse.inputBuffer;
                  } catch (e) {
                    // Still accumulating
                  }
                }
              }
            } else if (event.messageStop) {
              stopReason = event.messageStop.stopReason || "";
              log('✅ [BedrockChat] Converse stream completed', {
                totalChunks: chunkCount,
                stopReason
              });
              break;
            }
          } catch (eventError) {
            // Log event processing errors but continue stream to prevent $unknown crashes
            log('⚠️ [BedrockChat] Event processing error, continuing...', { 
              error: eventError.message,
              eventKeys: Object.keys(event || {})
            });
            continue;
          }
        }

        // AWS Documentation: Handle tool use
        if (stopReason === "tool_use") {
          yield "\n\n[Executing tools...]\n";

          const toolResults: ContentBlock[] = [];

          for (const content of assistantMessage.content) {
            if (content.toolUse) {
              const { toolUseId, name, input } = content.toolUse;
              
              log('🔧 [Tool] Executing tool', { name, input });

              // Debug: Check bucket state before tool execution
              log('🔍 [Tool] Checking instance state before execution', {
                hasBucket: !!this.couchbaseBucket,
                bucketType: this.couchbaseBucket ? typeof this.couchbaseBucket : 'null',
                bucketConstructor: this.couchbaseBucket ? this.couchbaseBucket.constructor.name : 'none',
                hasBackupBucket: !!(this as any)._bucketBackup,
                backupBucketType: (this as any)._bucketBackup ? typeof (this as any)._bucketBackup : 'null',
                instanceId: Math.random().toString(36).substring(2, 8)
              });

              let result;
              switch (name) {
                case "get_system_vitals":
                  result = await this.executeGetSystemVitals(input?.node_filter);
                  break;
                case "get_system_nodes":
                  result = await this.executeGetSystemNodes(input?.service_filter);
                  break;
                case "get_fatal_requests":
                  result = await this.executeGetFatalRequests(input?.period, input?.limit);
                  break;
                case "get_most_expensive_queries":
                  result = await this.executeGetMostExpensiveQueries(input?.limit, input?.period);
                  break;
                case "get_longest_running_queries":
                  result = await this.executeGetLongestRunningQueries(input?.limit);
                  break;
                case "get_most_frequent_queries":
                  result = await this.executeGetMostFrequentQueries(input?.limit);
                  break;
                case "get_largest_result_size_queries":
                  result = await this.executeGetLargestResultSizeQueries(input?.limit);
                  break;
                case "get_largest_result_count_queries":
                  result = await this.executeGetLargestResultCountQueries(input?.limit);
                  break;
                case "get_primary_index_queries":
                  result = await this.executeGetPrimaryIndexQueries(input?.limit);
                  break;
                case "get_system_indexes":
                  result = await this.executeGetSystemIndexes();
                  break;
                case "get_completed_requests":
                  result = await this.executeGetCompletedRequests(input?.limit);
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
                  result = await this.executeGetSchemaForCollection(input?.scope_name, input?.collection_name);
                  break;
                case "run_sql_plus_plus_query":
                  result = await this.executeRunSqlPlusPlusQuery(input?.scope_name, input?.query);
                  break;
                default:
                  result = { 
                    success: false, 
                    error: `Unknown tool: ${name}`,
                    content: `Error: Unknown tool '${name}'. Available tools: get_system_vitals, get_system_nodes, get_fatal_requests, get_most_expensive_queries, get_longest_running_queries, get_most_frequent_queries, get_largest_result_size_queries, get_largest_result_count_queries, get_primary_index_queries, get_system_indexes, get_completed_requests, get_prepared_statements, get_indexes_to_drop, get_detailed_indexes, get_detailed_prepared_statements, get_schema_for_collection, run_sql_plus_plus_query`
                  };
              }

              toolResults.push({
                toolResult: {
                  toolUseId,
                  content: [{ text: result.content || JSON.stringify(result) }],
                  status: result.success ? "success" : "error"
                }
              });
            }
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
            system: systemPrompt ? [{ text: systemPrompt }] : undefined,
            toolConfig,
            inferenceConfig: {
              maxTokens: options.max_tokens || 8000,
              temperature: options.temperature || 0.7,
            },
          });

          const continueResponse = await this.client.send(continueCommand);

          if (continueResponse.stream) {
            for await (const event of continueResponse.stream) {
              if (event.contentBlockDelta?.delta?.text) {
                yield event.contentBlockDelta.delta.text;
              }
            }
          }
        }
      } catch (streamError) {
        log('⚠️ [BedrockChat] Stream processing warning:', { error: streamError.message });
      }
    } catch (error) {
      err('❌ [BedrockChat] Failed to create chat completion with Converse API', {
        modelId: this.modelId,
        error: error.message
      });
      throw error;
    }
  }

  // Function to get model information
  getModelInfo() {
    return {
      provider: "AWS Bedrock",
      model: this.modelId
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
            throw new Error('Non-streaming chat completions not yet supported');
          }

          return this.createChatCompletion(options.messages, {
            temperature: options.temperature,
            max_tokens: options.max_tokens
          });
        }
      }
    };
  }
}