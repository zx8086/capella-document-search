// src/ai/tools/index.ts

// Cluster monitoring tools
import { getSystemNodesTool, getSystemVitalsTool } from "./cluster";
// Index analysis tools (using full path to avoid name conflict with this file)
import {
  getDetailedIndexesTool,
  getDetailedPreparedStatementsTool,
  getIndexesToDropTool,
  getPreparedStatementsTool,
  getSystemIndexesTool,
} from "./index/index";
// Query analysis tools
import {
  getCompletedRequestsTool,
  getFatalRequestsTool,
  getLargestResultCountQueriesTool,
  getLargestResultSizeQueriesTool,
  getLongestRunningQueriesTool,
  getMostExpensiveQueriesTool,
  getMostFrequentQueriesTool,
  getPrimaryIndexQueriesTool,
} from "./query";
// Schema tools
import { getSchemaForCollectionTool, runSqlPlusPlusQueryTool } from "./schema";

// Re-export all tools
export {
  // Cluster
  getSystemVitalsTool,
  getSystemNodesTool,
  // Query
  getFatalRequestsTool,
  getMostExpensiveQueriesTool,
  getLongestRunningQueriesTool,
  getMostFrequentQueriesTool,
  getLargestResultSizeQueriesTool,
  getLargestResultCountQueriesTool,
  getPrimaryIndexQueriesTool,
  getCompletedRequestsTool,
  // Schema
  getSchemaForCollectionTool,
  runSqlPlusPlusQueryTool,
  // Index
  getSystemIndexesTool,
  getPreparedStatementsTool,
  getIndexesToDropTool,
  getDetailedIndexesTool,
  getDetailedPreparedStatementsTool,
};

// Convenience array of all tools for binding to the model
export const allTools = [
  // Cluster
  getSystemVitalsTool,
  getSystemNodesTool,
  // Query
  getFatalRequestsTool,
  getMostExpensiveQueriesTool,
  getLongestRunningQueriesTool,
  getMostFrequentQueriesTool,
  getLargestResultSizeQueriesTool,
  getLargestResultCountQueriesTool,
  getPrimaryIndexQueriesTool,
  getCompletedRequestsTool,
  // Schema
  getSchemaForCollectionTool,
  runSqlPlusPlusQueryTool,
  // Index
  getSystemIndexesTool,
  getPreparedStatementsTool,
  getIndexesToDropTool,
  getDetailedIndexesTool,
  getDetailedPreparedStatementsTool,
];

// Tool name to tool mapping for dynamic lookup
export const toolsByName = Object.fromEntries(allTools.map((tool) => [tool.name, tool]));
