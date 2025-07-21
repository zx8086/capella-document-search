/* src/tools/queryAnalysis/getSystemIndexes.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlSystemIndexes } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_system_indexes",
    "Get information about all indexes in the system",
    {
      bucket_name: z.string().optional().describe("Filter by bucket name"),
      index_type: z.string().optional().describe("Filter by index type (e.g., GSI, FTS)"),
      include_system: z.boolean().optional().describe("Whether to include system indexes"),
    },
    async ({ bucket_name, index_type, include_system }) => {
      logger.info("Getting system indexes", { bucket_name, index_type, include_system });
      
      // Modify query based on parameters
      let query = n1qlSystemIndexes;
      
      // Build WHERE clause for filtering
      const whereClauses = [];
      
      if (bucket_name) {
        whereClauses.push(`t.keyspace_id = '${bucket_name}'`);
      }
      
      if (index_type) {
        whereClauses.push(`t.using = '${index_type}'`);
      }
      
      if (include_system !== true) {
        whereClauses.push(`t.\`namespace\` != 'system'`);
      }
      
      // Apply WHERE clauses if any
      if (whereClauses.length > 0) {
        const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
        
        if (query.includes("WHERE")) {
          query = query.replace(/WHERE.*?FROM/s, `WHERE ${whereClauses.join(' AND ')} FROM`);
        } else {
          query = query.replace("FROM system:indexes t;", `FROM system:indexes t ${whereClause};`);
        }
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "System Indexes"
      );
    }
  );
};
