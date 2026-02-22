/* Test Database Connection Endpoint */

import { json } from "@sveltejs/kit";
import { clusterConn } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { backendConfig } from "../../../backend-config";
import { systemVitalsQuery } from "../../../tools/queryAnalysis/analysisQueries";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  try {
    log("[TEST] [TestDB] Starting database connection test");

    // Log the credentials being used (mask password)
    log("[DEBUG] [TestDB] Using connection config", {
      URL: backendConfig.capella.URL,
      USERNAME: backendConfig.capella.USERNAME,
      PASSWORD_LENGTH: backendConfig.capella.PASSWORD?.length || 0,
      PASSWORD_STARTS_WITH: backendConfig.capella.PASSWORD?.substring(0, 3) || "none",
      BUCKET: backendConfig.capella.BUCKET,
    });

    // Test cluster connection
    const cluster = await clusterConn();
    log("[OK] [TestDB] Cluster connection successful");

    // Test bucket access
    const bucket = cluster.bucket(backendConfig.capella.BUCKET);
    log("[OK] [TestDB] Bucket obtained", {
      bucketName: backendConfig.capella.BUCKET,
      bucketType: typeof bucket,
      hasCluster: !!bucket.cluster,
    });

    // Test query execution
    log("[DEBUG] [TestDB] Testing system vitals query");
    const result = await cluster.query(systemVitalsQuery);
    const rows = await result.rows;

    log("[OK] [TestDB] Query executed successfully", { rowCount: rows.length });

    return json({
      success: true,
      connectionStatus: "Connected",
      bucketName: backendConfig.capella.BUCKET,
      queryResult: {
        rowCount: rows.length,
        rows: rows.slice(0, 2), // Show first 2 rows for testing
      },
    });
  } catch (error) {
    err("[ERROR] [TestDB] Database test failed", {
      error: error.message,
      stack: error.stack,
    });

    return json(
      {
        success: false,
        error: error.message,
        connectionStatus: "Failed",
      },
      { status: 500 }
    );
  }
};
