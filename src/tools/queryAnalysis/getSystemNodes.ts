/* src/tools/queryAnalysis/getSystemNodes.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { executeAnalysisQuery } from "./queryAnalysisUtils";
import { systemNodesQuery } from "./analysisQueries";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "get_system_nodes",
    "Get information about all nodes in the Couchbase cluster",
    {
      service_filter: z.string().optional().describe("Filter by service type (e.g., 'n1ql', 'kv', 'index', 'fts')"),
    },
    async ({ service_filter }) => {
      logger.info("Getting system nodes information", { service_filter });
      
      // Modify query based on parameters
      let query = systemNodesQuery;
      
      // Apply service filter if specified
      if (service_filter) {
        query = query.replace(
          "SELECT * FROM system:nodes;",
          `SELECT * FROM system:nodes 
           WHERE ANY s IN services SATISFIES s = "${service_filter}" END;`
        );
      }
      
      return executeAnalysisQuery(
        bucket, 
        query, 
        "Couchbase Cluster Nodes"
      );
    }
  );
};
