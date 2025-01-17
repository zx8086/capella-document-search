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
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle certificate error specifically
    if (errorMessage.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
      return {
        status: "ERROR",
        message: "SSL Certificate validation failed for Capella API",
        responseTime: duration,
        details: errorMessage
      };
    }
    
    err("Capella Cloud API health check failed:", {
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString()
    });
    return {
      status: "ERROR",
      message: errorMessage,
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

async function checkOpenReplayEndpoint(): Promise<CheckResult> {
    const startTime = Date.now();
    const openReplayUrl = frontendConfig.openreplay.INGEST_POINT;

    try {
        // Validate configuration
        if (!openReplayUrl) {
            return {
                status: "ERROR",
                message: "OpenReplay ingest point URL is not configured",
                responseTime: 0,
            };
        }

        // Validate URL format
        try {
            new URL(openReplayUrl);
        } catch {
            return {
                status: "ERROR",
                message: "Invalid OpenReplay ingest point URL format",
                responseTime: 0,
            };
        }

        // Attempt connection with OPTIONS request instead of HEAD
      const response = await fetch(`${openReplayUrl}/healthz`, {
            method: "GET",
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json'
            }
        });

        const duration = Date.now() - startTime;

        // Check if the response is 404 but the base URL might still be valid
        if (response.status === 404) {
            const baseResponse = await fetch(openReplayUrl, {
                method: "GET",
                headers: {
                    'Accept': '*/*',
                    'Content-Type': 'application/json'
                }
            });

            if (baseResponse.ok || baseResponse.status === 405) {
                return {
                    status: "OK",
                    message: "OpenReplay endpoint is accessible",
                    responseTime: duration,
                };
            }
        }

        if (response.ok) {
            return {
                status: "OK",
                message: "OpenReplay endpoint is responsive",
                responseTime: duration,
            };
        }

        // Handle specific status codes
        if (response.status === 401 || response.status === 403) {
            return {
                status: "ERROR",
                message: "OpenReplay authentication failed",
                responseTime: duration,
            };
        }

        return {
            status: "WARNING",
            message: `OpenReplay endpoint responded with status: ${response.status}`,
            responseTime: duration,
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Handle specific error types
        if (errorMessage.includes('certificate')) {
            return {
                status: "ERROR",
                message: "SSL Certificate validation failed for OpenReplay endpoint",
                responseTime: duration,
                details: errorMessage
            };
        }

        if (errorMessage.includes('ECONNREFUSED')) {
            return {
                status: "ERROR",
                message: "Connection refused to OpenReplay endpoint",
                responseTime: duration,
                details: errorMessage
            };
        }

        if (errorMessage.includes('ETIMEDOUT')) {
            return {
                status: "ERROR",
                message: "Connection timed out to OpenReplay endpoint",
                responseTime: duration,
                details: errorMessage
            };
        }

        err("OpenReplay endpoint health check failed:", {
            error: errorMessage,
            duration,
            timestamp: new Date().toISOString()
        });

        return {
            status: "ERROR",
            message: "Failed to connect to OpenReplay endpoint",
            responseTime: duration,
            details: errorMessage
        };
    }
}

async function checkOpenAIEndpoint(): Promise<CheckResult> {
    const startTime = Date.now();
    try {
        const openai = new OpenAI({
            apiKey: Bun.env.OPENAI_API_KEY
        });

        // Simple models list request to check connectivity
        const response = await openai.models.list();
        const duration = Date.now() - startTime;

        return {
            status: "OK",
            message: "OpenAI API is responsive",
            responseTime: duration,
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Handle specific error cases
        if (errorMessage.includes('401')) {
            return {
                status: "ERROR",
                message: "OpenAI API key is invalid",
                responseTime: duration,
            };
        }

        err("OpenAI endpoint health check failed:", error);
        return {
            status: "ERROR",
            message: errorMessage,
            responseTime: duration,
        };
    }
}

async function checkPineconeEndpoint(): Promise<CheckResult> {
    const startTime = Date.now();
    try {
        const pc = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        // List indexes to check connectivity
        const indexes = await pc.listIndexes();
        const duration = Date.now() - startTime;

        return {
            status: "OK",
            message: `Pinecone API is responsive (${indexes.length} indexes found)`,
            responseTime: duration,
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Handle specific error cases
        if (errorMessage.includes('401')) {
            return {
                status: "ERROR",
                message: "Pinecone API key is invalid",
                responseTime: duration,
            };
        }

        err("Pinecone endpoint health check failed:", error);
        return {
            status: "ERROR",
            message: errorMessage,
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
    let currentCheck = "";
    let failedChecks: string[] = [];

    const simpleChecks = [
      { name: "Internal Collections API", check: () => checkInternalAPI(fetch) },
      { name: "SQLite Database", check: checkDatabase },
      { name: "GraphQL Endpoint", check: checkGraphQLEndpoint },
    ].sort((a, b) => a.name.localeCompare(b.name));

    const detailedChecks = [
      ...simpleChecks,
      { name: "Elastic APM Server", check: checkElasticAPMEndpoint },
      { name: "External Capella Cloud API", check: checkCapellaAPI },
      { name: "OpenReplay Endpoint", check: checkOpenReplayEndpoint },
      { name: "OpenAI API", check: checkOpenAIEndpoint },
      { name: "Pinecone API", check: checkPineconeEndpoint },
      // { name: "OpenTelemetry Logs Endpoint", check: checkLogsEndpoint },
      // { name: "OpenTelemetry Metrics Endpoint", check: checkMetricsEndpoint },
      // { name: "OpenTelemetry Traces Endpoint", check: checkTracesEndpoint },
    ].sort((a, b) => a.name.localeCompare(b.name));
    
    // Run all checks in parallel but handle each independently
    await Promise.all((isSimpleCheck ? simpleChecks : detailedChecks)
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
          
          if (result.status === "ERROR") {
            failedChecks.push(name);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          err(`Health check failed for ${name}:`, {
            error: errorMessage,
            currentCheck,
            timestamp: new Date().toISOString()
          });
          healthStatus[name] = {
            status: "ERROR",
            message: errorMessage,
            responseTime: 0
          };
          failedChecks.push(name);
        }
      }));

    // Log final results with detailed information
    const finalStatus = Object.values(healthStatus).every((s) => s.status === "OK") ? "OK" : "WARNING";
    log("Health check completed", {
      status: finalStatus,
      checkType,
      failedChecks,
      results: Object.fromEntries(
        Object.entries(healthStatus).map(([k, v]) => [k, { 
          status: v.status, 
          responseTime: v.responseTime,
          message: v.message 
        }])
      )
    });

    return json({
      status: finalStatus,
      version: {
        build: BUILD_VERSION,
        commit: COMMIT_HASH,
        buildDate: BUILD_DATE
      },
      checks: healthStatus,
      checkType: checkType,
      failedChecks: failedChecks.length > 0 ? failedChecks : undefined
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    err("Unhandled health check error:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    return json({
      status: "ERROR",
      message: errorMessage,
      checks: {},
      checkType: url.searchParams.get("type") || "Simple",
      error: {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }
    }, { status: 200 });
  }
}
