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
import { dns } from "bun";
import { safeDnsPrefetch } from "$lib/utils/dnsUtils";
import { prefetchDnsForCategories } from "$lib/config/dnsConfig";

const INDIVIDUAL_CHECK_TIMEOUT = 15000; // 15 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 30000; // 30 seconds timeout for Capella API
const GLOBAL_CHECK_TIMEOUT = 90000; // 90 seconds timeout for the entire health check

const BUILD_VERSION = process.env.BUILD_VERSION || 'development';
const COMMIT_HASH = process.env.COMMIT_HASH || 'unknown';
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString();

async function checkOpenTelemetryEndpoint(
  url: string,
  name: string,
  fetch: typeof global.fetch
): Promise<CheckResult> {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Accept': 'application/x-protobuf'
      }
    });
    const duration = Date.now() - startTime;

    if (response.ok || response.status === 415 || response.status === 400) {
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

async function checkTracesEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.TRACES_ENDPOINT,
    "Traces",
    fetch
  );
}

async function checkMetricsEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.METRICS_ENDPOINT,
    "Metrics",
    fetch
  );
}

async function checkLogsEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(
    backendConfig.openTelemetry.LOGS_ENDPOINT,
    "Logs",
    fetch
  );
}

async function checkElasticAPMEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkGraphQLEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkCapellaAPI(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkDatabase(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkInternalAPI(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkOpenReplayEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
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

        // Check the web start endpoint
        const response = await fetch(`${openReplayUrl}/v1/web/start`, {
            method: "GET",
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json'
            }
        });

        const duration = Date.now() - startTime;

        if (response.ok || response.status === 405) { // 405 is acceptable as it may require POST
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
            };
        }

        if (errorMessage.includes('ECONNREFUSED')) {
            return {
                status: "ERROR",
                message: "Connection refused to OpenReplay endpoint",
                responseTime: duration,
            };
        }

        if (errorMessage.includes('ETIMEDOUT')) {
            return {
                status: "ERROR",
                message: "Connection timed out to OpenReplay endpoint",
                responseTime: duration,
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
        };
    }
}

async function checkOpenAIEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkPineconeEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
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

async function checkLangSmithEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
    const startTime = Date.now();
    const langsmithEndpoint = Bun.env.LANGSMITH_ENDPOINT;
    const apiKey = Bun.env.LANGSMITH_API_KEY;

    try {
        if (!langsmithEndpoint || !apiKey) {
            return {
                status: "ERROR",
                message: "LangSmith configuration is missing",
                responseTime: 0,
            };
        }

        // Test the LangSmith API by making a request to the /health endpoint
        const response = await fetch(`${langsmithEndpoint}/health`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const duration = Date.now() - startTime;

        if (response.ok) {
            return {
                status: "OK",
                message: "LangSmith API is responsive",
                responseTime: duration,
            };
        }

        if (response.status === 401) {
            return {
                status: "ERROR",
                message: "LangSmith API key is invalid",
                responseTime: duration,
            };
        }

        return {
            status: "WARNING",
            message: `LangSmith API responded with status: ${response.status}`,
            responseTime: duration,
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        err("LangSmith endpoint health check failed:", {
            error: errorMessage,
            duration,
            timestamp: new Date().toISOString()
        });

        return {
            status: "ERROR",
            message: "Failed to connect to LangSmith API",
            responseTime: duration,
        };
    }
}

async function prefetchHealthCheckEndpoints() {
    await prefetchDnsForCategories(['api', 'monitoring']);
}

export async function GET({ fetch, url }: RequestEvent) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GLOBAL_CHECK_TIMEOUT);

        const response = await Promise.race([
            (async () => {
                try {
                    log("Health check started", {
                        type: url.searchParams.get("type") || "Simple",
                        timestamp: new Date().toISOString()
                    });

                    const checkType = url.searchParams.get("type") || "Simple";
                    const isSimpleCheck = checkType === "Simple";
                    
                    const healthStatus: Record<string, CheckResult> = {};
                    let failedChecks: string[] = [];

                    const simpleChecks = [
                        { name: "Internal Collections API", check: () => checkInternalAPI(fetch) },
                        { name: "SQLite Database", check: () => checkDatabase(fetch) },
                        { name: "GraphQL Endpoint", check: () => checkGraphQLEndpoint(fetch) },
                    ].sort((a, b) => a.name.localeCompare(b.name));

                    const detailedChecks = [
                        ...simpleChecks,
                        { name: "Elastic APM Server", check: () => checkElasticAPMEndpoint(fetch) },
                        { name: "External Capella Cloud API", check: () => checkCapellaAPI(fetch) },
                        { name: "OpenReplay Endpoint", check: () => checkOpenReplayEndpoint(fetch) },
                        { name: "OpenAI API", check: () => checkOpenAIEndpoint(fetch) },
                        { name: "Pinecone API", check: () => checkPineconeEndpoint(fetch) },
                        { name: "LangSmith API", check: () => checkLangSmithEndpoint(fetch) },
                        { name: "OpenTelemetry Logs Endpoint", check: () => checkLogsEndpoint(fetch) },
                        { name: "OpenTelemetry Metrics Endpoint", check: () => checkMetricsEndpoint(fetch) },
                        { name: "OpenTelemetry Traces Endpoint", check: () => checkTracesEndpoint(fetch) },
                    ].sort((a, b) => a.name.localeCompare(b.name));
                    
                    // Call before health checks
                    await prefetchHealthCheckEndpoints();

                    // Modify the Promise.all to ensure individual check failures don't stop other checks
                    await Promise.allSettled((isSimpleCheck ? simpleChecks : detailedChecks)
                        .map(async ({ name, check }) => {
                            try {
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
                                    timestamp: new Date().toISOString()
                                });
                                
                                // Ensure we still record a result even on error
                                healthStatus[name] = {
                                    status: "ERROR",
                                    message: `Check failed: ${errorMessage}`,
                                    responseTime: 0
                                };
                                failedChecks.push(name);
                            }
                        }));

                    // Determine overall status - only mark as ERROR if all checks failed
                    const allChecksFailed = Object.values(healthStatus).every(s => s.status === "ERROR");
                    const finalStatus = allChecksFailed ? "ERROR" : 
                        (failedChecks.length > 0 ? "WARNING" : "OK");

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
                    });
                } catch (error) {
                    // Log the error but return a partial response
                    err("Error during health check execution:", error);
                    return json({
                        status: "WARNING",
                        message: "Some health checks could not be completed",
                        version: {
                            build: BUILD_VERSION,
                            commit: COMMIT_HASH,
                            buildDate: BUILD_DATE
                        },
                        checks: healthStatus || {},
                        checkType: url.searchParams.get("type") || "Simple",
                        failedChecks
                    });
                }
            })(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Health check timed out')), GLOBAL_CHECK_TIMEOUT)
            )
        ]);

        clearTimeout(timeoutId);
        return response;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        err("Unhandled health check error:", {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });

        // Return a more graceful error response
        return json({
            status: "WARNING",
            message: "Health check encountered issues",
            error: {
                message: errorMessage,
                stack: process.env.NODE_ENV === 'development' ? 
                    (error instanceof Error ? error.stack : undefined) : undefined
            }
        }, { 
            status: 200, // Return 200 instead of 500 to prevent cascading failures
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cross-Origin-Resource-Policy': 'cross-origin'
            }
        });
    }
}
