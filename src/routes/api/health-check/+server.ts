/* src/routes/api/health-check/+server.ts */

import { json } from "@sveltejs/kit";
import { log, err } from "$utils/unifiedLogger";
import {
  initializeDatabase,
  getAllCollectionsWithTooltips,
} from "$lib/db/dbOperations";
import { getAllScopes } from "$lib/api";
import type { CheckResult } from "../../../models";
import { frontendConfig } from "../../../frontend-config";
import { backendConfig } from "$backendConfig";
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";
import type { RequestEvent } from '@sveltejs/kit';

const INDIVIDUAL_CHECK_TIMEOUT = 15000; // 15 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 30000; // 30 seconds timeout for Capella API
const GLOBAL_CHECK_TIMEOUT = 60000; // 60 seconds timeout for the entire health check dummy

const BUILD_VERSION = process.env.BUILD_VERSION || 'development';
const COMMIT_HASH = process.env.COMMIT_HASH || 'unknown';
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString();

async function checkOpenTelemetryEndpoint(
  url: string,
  name: string,
): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, { method: "HEAD" });
    const duration = Date.now() - startTime;

    if (response.ok) {
      return {
        status: "OK",
        message: `${name} endpoint is responsive`,
        responseTime: duration,
      };
    } else {
      throw new Error(`${name} responded with status: ${response.status}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    err(`${name} health check failed:`, error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkTracesEndpoint(): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.TRACES_ENDPOINT,
    "Traces",
  );
}

async function checkMetricsEndpoint(): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.METRICS_ENDPOINT,
    "Metrics",
  );
}

async function checkLogsEndpoint(): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.LOGS_ENDPOINT,
    "Logs",
  );
}

async function checkElasticAPMEndpoint(): Promise<CheckResult> {
  const startTime = Date.now();
  const apmServerUrl = frontendConfig.elasticApm.SERVER_URL;

  if (!apmServerUrl) {
    return {
      status: "ERROR",
      message: "APM Server URL is not configured",
      responseTime: 0,
    };
  }

  try {
    const response = await fetch(`${apmServerUrl}/`, {
      method: "HEAD",
    });

    const duration = Date.now() - startTime;

    if (response.ok) {
      return {
        status: "OK",
        message: "Elastic APM server endpoint is responsive",
        responseTime: duration,
      };
    } else {
      throw new Error(`APM server responded with status: ${response.status}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    err("Elastic APM server endpoint health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkGraphQLEndpoint(): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    const client = new ApolloClient({
      link: createHttpLink({
        uri: backendConfig.application.GRAPHQL_ENDPOINT,
        fetch,
      }),
      cache: new InMemoryCache(),
    });

    const query = gql`
      query HealthCheck {
        __typename
      }
    `;

    const result = await client.query({ query });
    const duration = Date.now() - startTime;

    if (result.data.__typename) {
      return {
        status: "OK",
        message: "GraphQL endpoint is responsive",
        responseTime: duration,
      };
    } else {
      throw new Error("Unexpected response from GraphQL endpoint");
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    err("GraphQL endpoint health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkCapellaAPI(): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    log("Starting Capella API check...");
    const collections = await getAllScopes();
    const duration = Date.now() - startTime;
    log(`Capella API check successful: ${collections.length} collections retrieved`);
    return {
      status: "OK",
      message: `External API is working. Retrieved ${collections.length} collections.`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    err("Capella Cloud API health check failed:", {
      error: error instanceof Error ? error.message : String(error),
      duration,
      timestamp: new Date().toISOString()
    });
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    initializeDatabase();
    const collections = await getAllCollectionsWithTooltips();
    const duration = Date.now() - startTime;
    return {
      status: "OK",
      message: `Retrieved ${collections.length} collections from local database.`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    err("Database health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkInternalAPI(fetch: Function): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    log("GET: /api/collections");
    const response = await fetch("/api/collections");
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`,
      );
    }
    const collections = await response.json();
    const duration = Date.now() - startTime;
    log(`Fetched collections successfully. Count: ${collections.length}`);
    return {
      status: "OK",
      message: `Internal API is working. Retrieved ${collections.length} collections.`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    err("Internal API health check failed:", error);
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

export async function GET({ fetch, url }: RequestEvent) {
  try {
    log("Health check started", {
      type: url.searchParams.get("type") || "Simple",
      timestamp: new Date().toISOString()
    });

    const checkType = url.searchParams.get("type") || "Simple";
    const isSimpleCheck = checkType === "Simple";
    
    log(`Processing ${checkType} check`);
    
    const healthStatus: Record<string, CheckResult> = {};
    
    // Track which check is currently running
    let currentCheck = "";
    
    // Define the checks
    const simpleChecks = [
      { name: "Internal Collections API", check: () => checkInternalAPI(fetch) },
      { name: "SQLite Database", check: checkDatabase },
      { name: "GraphQL Endpoint", check: checkGraphQLEndpoint },
    ].sort((a, b) => a.name.localeCompare(b.name));

    const detailedChecks = [
      ...simpleChecks,
      { name: "Elastic APM Server", check: checkElasticAPMEndpoint },
      { name: "External Capella Cloud API", check: checkCapellaAPI },
      // { name: "OpenTelemetry Logs Endpoint", check: checkLogsEndpoint },
      // { name: "OpenTelemetry Metrics Endpoint", check: checkMetricsEndpoint },
      // { name: "OpenTelemetry Traces Endpoint", check: checkTracesEndpoint },
    ].sort((a, b) => a.name.localeCompare(b.name));
    
    // Ensure we're properly awaiting all check promises
    const checkPromises = (isSimpleCheck ? simpleChecks : detailedChecks)
      .map(async ({ name, check }) => {
        try {
          currentCheck = name;
          log(`Starting check: ${name}`);
          
          const result = await Promise.race([
            check(),
            new Promise<CheckResult>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout: ${name} check took too long`)),
                name === "External Capella Cloud API"
                  ? CAPELLA_API_TIMEOUT
                  : INDIVIDUAL_CHECK_TIMEOUT,
              ),
            ),
          ]);
          
          log(`Check completed: ${name}`, {
            status: result.status,
            responseTime: result.responseTime
          });
          
          healthStatus[name] = result;
        } catch (error) {
          err(`Health check failed for ${name}:`, {
            error: error instanceof Error ? error.message : String(error),
            currentCheck,
            timestamp: new Date().toISOString()
          });
          healthStatus[name] = {
            status: "ERROR",
            message: error instanceof Error ? error.message : String(error),
            responseTime: 0
          };
        }
      });

    // Add global timeout with better error handling
    try {
      await Promise.race([
        Promise.all(checkPromises),
        new Promise((_, reject) =>
          setTimeout(
            () => {
              err("Global health check timeout", {
                currentCheck,
                checkType,
                timestamp: new Date().toISOString()
              });
              reject(new Error("Global health check timeout"));
            },
            GLOBAL_CHECK_TIMEOUT,
          ),
        ),
      ]);
    } catch (error) {
      err("Global health check error:", {
        error: error instanceof Error ? error.message : String(error),
        currentCheck,
        checkType,
        timestamp: new Date().toISOString()
      });
      return json({
        status: "ERROR",
        message: "Health check timed out",
        checks: healthStatus,
        checkType: checkType
      }, { status: 200 });
    }

    // Log final results
    log("Health check completed", {
      status: Object.values(healthStatus).every((s) => s.status === "OK") ? "OK" : "ERROR",
      checkType,
      results: Object.fromEntries(
        Object.entries(healthStatus).map(([k, v]) => [k, { status: v.status, responseTime: v.responseTime }])
      )
    });

    return json(
      {
        status: Object.values(healthStatus).every((s) => s.status === "OK") ? "OK" : "ERROR",
        version: {
          build: BUILD_VERSION,
          commit: COMMIT_HASH,
          buildDate: BUILD_DATE
        },
        checks: healthStatus,
        checkType: checkType,
      },
      { status: 200 },
    );
  } catch (error) {
    err("Unhandled health check error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    return json({
      status: "ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      checks: {},
      checkType: url.searchParams.get("type") || "Simple"
    }, { status: 200 });
  }
}
