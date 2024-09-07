/* src/routes/api/health-check/+server.ts */

import { json } from "@sveltejs/kit";
import { log, err } from "$utils/unifiedLogger";
import {
  initializeDatabase,
  getAllCollectionsWithTooltips,
} from "$lib/db/dbOperations";
import { getAllScopes } from "$lib/api";

const INDIVIDUAL_CHECK_TIMEOUT = 10000; // 10 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 15000; // 15 seconds timeout for Capella API
const GLOBAL_CHECK_TIMEOUT = 60000; // 60 seconds timeout for the entire health check

async function checkCapellaAPI(): Promise<{
  status: string;
  message?: string;
}> {
  const startTime = Date.now();
  try {
    const scopes = await getAllScopes();
    const duration = Date.now() - startTime;
    return {
      status: "OK",
      message: `Retrieved ${scopes.length} scopes. Response time: ${duration}ms`,
    };
  } catch (error) {
    err("Capella API health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDatabase(): Promise<{ status: string; message?: string }> {
  try {
    initializeDatabase();
    const collections = await getAllCollectionsWithTooltips();
    return {
      status: "OK",
      message: `Retrieved ${collections.length} collections with tooltips.`,
    };
  } catch (error) {
    err("Database health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  log("GET request received for health check");
  const healthStatus: Record<string, { status: string; message?: string }> = {};

  const checks = [
    { name: "Capella API", check: checkCapellaAPI },
    { name: "Database", check: checkDatabase },
  ];

  const checkPromises = checks.map(async ({ name, check }) => {
    try {
      const result = await Promise.race([
        check(),
        new Promise<{ status: string; message: string }>((_, reject) =>
          setTimeout(
            () => reject(new Error("Individual check timeout")),
            name === "Capella API"
              ? CAPELLA_API_TIMEOUT
              : INDIVIDUAL_CHECK_TIMEOUT,
          ),
        ),
      ]);
      healthStatus[name] = result;
    } catch (error) {
      healthStatus[name] = {
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  try {
    await Promise.race([
      Promise.all(checkPromises),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Global health check timeout")),
          GLOBAL_CHECK_TIMEOUT,
        ),
      ),
    ]);
  } catch (error) {
    err("Health check encountered an error:", error);
  }

  const overallStatus = Object.values(healthStatus).every(
    (s) => s.status === "OK",
  )
    ? "OK"
    : "ERROR";

  return json({ status: overallStatus, checks: healthStatus }, { status: 200 });
}
