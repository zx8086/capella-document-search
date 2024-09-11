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
import backendConfig from "$backendConfig";
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client/core";

const INDIVIDUAL_CHECK_TIMEOUT = 15000; // 15 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 30000; // 30 seconds timeout for Capella API
const GLOBAL_CHECK_TIMEOUT = 60000; // 60 seconds timeout for the entire health check

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
    { name: "SQLite Database", check: checkDatabase },
    { name: "Internal Collections API", check: () => checkInternalAPI(fetch) },
  ];

  const detailedChecks = [
    ...simpleChecks,
    { name: "External Capella Cloud API", check: checkCapellaAPI },
    { name: "GraphQL Endpoint", check: checkGraphQLEndpoint },
  ];

  const checksToRun = isSimpleCheck ? simpleChecks : detailedChecks;

  const checkPromises = checksToRun.map(async ({ name, check }) => {
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

  return json(
    {
      status: overallStatus,
      checks: healthStatus,
      checkType: isSimpleCheck ? "simple" : "detailed",
    },
    { status: 200 },
  );
}
