/* Test Database Connection Endpoint */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../../backend-config";
import { log, err } from "$utils/unifiedLogger";
import { systemVitalsQuery } from "../../../tools/queryAnalysis/analysisQueries";

export const GET: RequestHandler = async () => {
  try {
    log("🧪 [TestDB] Starting database connection test");
    
    // Log the credentials being used (mask password)
    log("🔍 [TestDB] Using connection config", {
      URL: backendConfig.capella.URL,
      USERNAME: backendConfig.capella.USERNAME,
      PASSWORD_LENGTH: backendConfig.capella.PASSWORD?.length || 0,
      PASSWORD_STARTS_WITH: backendConfig.capella.PASSWORD?.substring(0, 3) || "none",
      BUCKET: backendConfig.capella.BUCKET
    });
    
    // Test cluster connection
    const cluster = await clusterConn();
    log("✅ [TestDB] Cluster connection successful");
    
    // Test bucket access
    const bucket = cluster.bucket(backendConfig.capella.BUCKET);
    log("✅ [TestDB] Bucket obtained", { 
      bucketName: backendConfig.capella.BUCKET,
      bucketType: typeof bucket,
      hasCluster: !!bucket.cluster
    });
    
    // Test query execution
    log("🔍 [TestDB] Testing system vitals query");
    const result = await cluster.query(systemVitalsQuery);
    const rows = await result.rows;
    
    log("✅ [TestDB] Query executed successfully", { rowCount: rows.length });
    
    return json({
      success: true,
      connectionStatus: "Connected",
      bucketName: backendConfig.capella.BUCKET,
      queryResult: {
        rowCount: rows.length,
        rows: rows.slice(0, 2) // Show first 2 rows for testing
      }
    });
    
  } catch (error) {
    err("❌ [TestDB] Database test failed", { 
      error: error.message,
      stack: error.stack 
    });
    
    return json({
      success: false,
      error: error.message,
      connectionStatus: "Failed"
    }, { status: 500 });
  }
};