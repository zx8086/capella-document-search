/* src/routes/api/health-check/+server.ts */

import { json } from "@sveltejs/kit";
import { log, err } from "$utils/unifiedLogger";
import {
  initializeDatabase,
  getAllCollectionsWithTooltips,
} from "$lib/db/dbOperations";
import { getAllScopes } from "$lib/api";
import type { CheckResult } from "../../../models";
import fetch from "cross-fetch";
import { frontendConfig } from "../../../frontend-config";
// console.log("Imported frontendConfig:", frontendConfig); // Debug log
import { backendConfig } from "$backendConfig";
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";

const INDIVIDUAL_CHECK_TIMEOUT = 15000; // 15 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 30000; // 30 seconds timeout for Capella API
const GLOBAL_CHECK_TIMEOUT = 60000; // 60 seconds timeout for the entire health check

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

  // console.log("APM Server URL:", apmServerUrl); // Debug log
  // console.log("Frontend Config:", frontendConfig); // Debug entire config

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
    const collections = await getAllScopes();
    const duration = Date.now() - startTime;
    return {
      status: "OK",
      message: `External API is working. Retrieved ${collections.length} collections.`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    err("Capella Cloud API health check failed:", error);
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
      message: `Retrieved ${collections.length} collections with tooltips.`,
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

export async function GET({ url, fetch }: { url: URL; fetch: Function }) {
  log("GET request received for health check");
  const checkType = url.searchParams.get("type") || "Simple";
  const isSimpleCheck = checkType === "Simple";

  const healthStatus: Record<string, CheckResult> = {};

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

  const checksToRun = isSimpleCheck ? simpleChecks : detailedChecks;

  const checkPromises = checksToRun.map(async ({ name, check }) => {
    try {
      const result = await Promise.race([
        check(),
        new Promise<{ status: string; message: string }>((_, reject) =>
          setTimeout(
            () => reject(new Error("Individual check timeout")),
            name === "External Capella Cloud API"
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

  // Sort the healthStatus object
  const sortedHealthStatus = Object.fromEntries(
    Object.entries(healthStatus).sort(([a], [b]) => a.localeCompare(b)),
  );

  const overallStatus = Object.values(sortedHealthStatus).every(
    (s) => s.status === "OK",
  )
    ? "OK"
    : "ERROR";

  return json(
    {
      status: overallStatus,
      version: {
        build: BUILD_VERSION,
        commit: COMMIT_HASH,
        buildDate: BUILD_DATE
      },
      checks: sortedHealthStatus,
      checkType: isSimpleCheck ? "Simple" : "Detailed",
    },
    { status: 200 },
  );
}
