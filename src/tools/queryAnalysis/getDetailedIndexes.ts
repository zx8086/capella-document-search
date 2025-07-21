/* src/tools/queryAnalysis/getDetailedIndexes.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { detailedIndexesQuery } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_detailed_indexes",
    "Get detailed information about all indexes in the Couchbase system",
    {
      bucket_name: z.string().optional().describe("Filter by bucket name"),
      scope_name: z.string().optional().describe("Filter by scope name"),
      collection_name: z.string().optional().describe("Filter by collection name"),
      state: z.string().optional().describe("Filter by state (e.g., 'online', 'deferred')"),
      has_condition: z.boolean().optional().describe("Filter for indexes with conditions"),
      is_primary: z.boolean().optional().describe("Filter for primary indexes only"),
      index_type: z.string().optional().describe("Filter by index type (e.g., 'GSI', 'FTS')"),
      sort_by: z.enum(["name", "state", "keyspace_id", "last_scan_time"]).optional().default("keyspace_id").describe("Sort results by field"),
    },
    async ({ bucket_name, scope_name, collection_name, state, has_condition, is_primary, index_type, sort_by }) => {
      logger.info("Getting detailed indexes information", { 
        bucket_name, scope_name, collection_name, state, has_condition, is_primary, index_type, sort_by 
      });
      
      // Modify query based on parameters
      let query = detailedIndexesQuery;
      
      // Build WHERE clause for filtering
      const whereClauses = [];
      
      if (bucket_name) {
        whereClauses.push(`t.bucket_id = '${bucket_name}' OR t.keyspace_id = '${bucket_name}'`);
      }
      
      if (scope_name) {
        whereClauses.push(`t.scope_id = '${scope_name}'`);
      }
      
      if (collection_name) {
        whereClauses.push(`t.keyspace_id = '${collection_name}'`);
      }
      
      if (state) {
        whereClauses.push(`t.state = '${state}'`);
      }
      
      if (has_condition === true) {
        whereClauses.push(`t.condition IS NOT NULL`);
      } else if (has_condition === false) {
        whereClauses.push(`t.condition IS NULL`);
      }
      
      if (is_primary === true) {
        whereClauses.push(`t.is_primary = true`);
      } else if (is_primary === false) {
        whereClauses.push(`(t.is_primary IS MISSING OR t.is_primary = false)`);
      }
      
      if (index_type) {
        whereClauses.push(`t.using = '${index_type}'`);
      }
      
      // Apply WHERE clauses if any
      if (whereClauses.length > 0) {
        const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
        
        // Replace existing WHERE or add new one
        if (query.includes("WHERE")) {
          query = query.replace(/WHERE.*?(?=ORDER BY|$)/s, `${whereClause} `);
        } else {
          query = query.replace(/ORDER BY/i, `${whereClause} ORDER BY`);
        }
      }
      
      // Apply sorting
      let orderByField: string;
      switch (sort_by) {
        case "name":
          orderByField = "t.name";
          break;
        case "state":
          orderByField = "t.state";
          break;
        case "last_scan_time":
          orderByField = "t.metadata.last_scan_time";
          break;
        case "keyspace_id":
        default:
          orderByField = "t.keyspace_id, t.name";
          break;
      }
      
      // Replace ORDER BY clause
      query = query.replace(/ORDER BY.*?(?=;|$)/i, `ORDER BY ${orderByField}`);
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Detailed Index Information"
      );
    }
  );
};
