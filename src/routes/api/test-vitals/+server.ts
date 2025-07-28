import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clusterConn } from "$lib/couchbaseConnector";

export const GET: RequestHandler = async () => {
  try {
    const cluster = await clusterConn();
    
    // Test 1: Basic system:vitals query
    const vitalsResult = await cluster.query("SELECT * FROM system:vitals");
    const vitalsRows = await vitalsResult.rows;
    
    // Test 2: Try with explicit node listing
    const nodesResult = await cluster.query("SELECT * FROM system:nodes");
    const nodesRows = await nodesResult.rows;
    
    // Test 3: Try to get vitals with a different approach
    const vitalsWithMetaResult = await cluster.query("SELECT META().id, * FROM system:vitals");
    const vitalsWithMetaRows = await vitalsWithMetaResult.rows;
    
    return json({
      success: true,
      tests: {
        basicVitals: {
          query: "SELECT * FROM system:vitals",
          rowCount: vitalsRows.length,
          rows: vitalsRows
        },
        allNodes: {
          query: "SELECT * FROM system:nodes",
          rowCount: nodesRows.length,
          nodeNames: nodesRows.map(r => r.nodes?.name || 'unknown')
        },
        vitalsWithMeta: {
          query: "SELECT META().id, * FROM system:vitals",
          rowCount: vitalsWithMetaRows.length,
          rows: vitalsWithMetaRows
        }
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};