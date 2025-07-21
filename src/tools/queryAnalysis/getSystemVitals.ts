/* src/tools/queryAnalysis/getSystemVitals.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { systemVitalsQuery } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_system_vitals",
    "Get detailed system vitals and performance metrics for the Couchbase cluster",
    {
      node_filter: z.string().optional().describe("Filter by node name (e.g., 'node1.example.com:8091')"),
    },
    async ({ node_filter }) => {
      logger.info("Getting system vitals information", { node_filter });
      
      // Modify query based on parameters
      let query = systemVitalsQuery;
      
      // Apply node filter if specified
      if (node_filter) {
        query = query.replace(
          "SELECT * FROM system:vitals;",
          `SELECT * FROM system:vitals 
           WHERE node LIKE "%${node_filter}%";`
        );
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Couchbase System Vitals"
      );
    }
  );
};
