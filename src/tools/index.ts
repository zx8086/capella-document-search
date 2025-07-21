/* src/tools/index.ts */

import getScopesAndCollections from './getScopesAndCollections';
import getSchemaForCollection from './getSchemaForCollection';
import runSqlPlusPlusQuery from './runSqlPlusPlusQuery';
import getDocumentById from './getDocumentById';
import upsertDocumentById from './upsertDocumentById';
import deleteDocumentById from './deleteDocumentById';
import createDocumentation from './createDocumentation';
import listDocumentation from './listDocumentation';
import deleteDocumentation from './deleteDocumentation';
import syncDocumentation from './syncDocumentation';
import readDocumentation from './readDocumentation';
import listPlaybooks from './listPlaybooks';

// Import query analysis tools
import { queryAnalysisTools } from './queryAnalysis';
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";

export type ToolFunction = (server: McpServer, bucket: Bucket) => void;

// Register all documentation tools
const registerDocumentationTools = (server: McpServer, bucket: Bucket) => {
  createDocumentation(server, bucket);
  listDocumentation(server, bucket);
  deleteDocumentation(server, bucket);
  syncDocumentation(server, bucket);
  readDocumentation(server, bucket);
};

// Register all query analysis tools
const registerQueryAnalysisTools = (server: McpServer, bucket: Bucket) => {
  Object.values(queryAnalysisTools).forEach(tool => tool(server, bucket));
};

// Register all playbook tools
const registerPlaybookTools = (server: McpServer, bucket: Bucket) => {
  listPlaybooks(server, bucket);
};

export const toolRegistry: Record<string, ToolFunction> = {
    // Core database tools
    get_scopes_and_collections: getScopesAndCollections,
    get_schema_for_collection: getSchemaForCollection,
    run_sql_plus_plus_query: runSqlPlusPlusQuery,
    get_document_by_id: getDocumentById,
    upsert_document_by_id: upsertDocumentById,
    delete_document_by_id: deleteDocumentById,
    
    // Documentation tools
    create_documentation: createDocumentation,
    list_documentation: listDocumentation,
    read_documentation: readDocumentation,
    delete_documentation: deleteDocumentation,
    sync_documentation_with_database: syncDocumentation,
    
    // Playbook tools
    list_playbooks: listPlaybooks,
    
    // Query analysis tools
    get_fatal_requests: queryAnalysisTools.getFatalRequests,
    get_longest_running_queries: queryAnalysisTools.getLongestRunningQueries,
    get_most_frequent_queries: queryAnalysisTools.getMostFrequentQueries,
    get_largest_result_size_queries: queryAnalysisTools.getLargestResultSizeQueries,
    get_largest_result_count_queries: queryAnalysisTools.getLargestResultCountQueries,
    get_primary_index_queries: queryAnalysisTools.getPrimaryIndexQueries,
    get_system_indexes: queryAnalysisTools.getSystemIndexes,
    get_completed_requests: queryAnalysisTools.getCompletedRequests,
    get_indexes_to_drop: queryAnalysisTools.getIndexesToDrop,
    get_most_expensive_queries: queryAnalysisTools.getMostExpensiveQueries,
    get_prepared_statements: queryAnalysisTools.getPreparedStatements,
    get_document_type_examples: queryAnalysisTools.getDocumentTypeExamples,
    analyze_document_structure: queryAnalysisTools.analyzeDocumentStructure,
    suggest_query_optimizations: queryAnalysisTools.suggestQueryOptimizations,
    
    // System information tools
    get_system_nodes: queryAnalysisTools.getSystemNodes,
    get_system_vitals: queryAnalysisTools.getSystemVitals,
    get_detailed_prepared_statements: queryAnalysisTools.getDetailedPreparedStatements,
    get_detailed_indexes: queryAnalysisTools.getDetailedIndexes,
};

export default toolRegistry;