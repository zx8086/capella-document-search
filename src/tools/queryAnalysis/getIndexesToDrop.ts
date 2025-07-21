/* src/tools/queryAnalysis/getIndexesToDrop.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { n1qlIndexesToDrop } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_indexes_to_drop",
    "Get indexes that might be candidates for removal (never scanned)",
    {
      bucket_filter: z.string().optional().describe("Optional filter for bucket names (comma-separated)"),
    },
    async ({ bucket_filter }) => {
      logger.info("Getting indexes that are candidates for removal", { bucket_filter });
      
      // Modify query based on parameters
      let query = n1qlIndexesToDrop;
      
      // Apply bucket filter if specified
      if (bucket_filter) {
        const buckets = bucket_filter.split(',').map(b => b.trim());
        const bucketList = buckets.map(b => `"${b}"`).join(', ');
        
        // Modify the ANY v IN clause
        query = query.replace(
          /ANY v IN \[.*?\]/g,
          `ANY v IN [${bucketList}]`
        );
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Indexes That Could Be Dropped (Never Scanned)"
      );
    }
  );
};
