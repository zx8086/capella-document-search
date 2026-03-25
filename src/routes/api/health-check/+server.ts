// src/routes/api/health-check/+server.ts
// Enhanced with telemetry status (SIO-374)

import { ApolloClient, createHttpLink, gql, InMemoryCache } from "@apollo/client/core";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Pinecone } from "@pinecone-database/pinecone";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { backendConfig } from "$backendConfig";
import { getAllScopes } from "$lib/api";
import { getAllCollectionsWithTooltips, initializeDatabase } from "$lib/db/dbOperations";
import { err, log } from "$utils/unifiedLogger";
import {
  getCredentialDiagnostics,
  redactCredential,
} from "../../../ai/clients/credential-diagnostics";
import { frontendConfig } from "../../../frontend-config";
import type { CheckResult } from "../../../models";
import { getCardinalityStatus } from "../../../otel/cardinality-guard";
import { formatExportStats } from "../../../otel/export-stats-tracker";
import { getCircuitBreakerStatus } from "../../../otel/telemetry-circuit-breaker";

const INDIVIDUAL_CHECK_TIMEOUT = 15000; // 15 seconds timeout for most checks
const CAPELLA_API_TIMEOUT = 30000; // 30 seconds timeout for Capella API
const AWS_API_TIMEOUT = 20000; // 20 seconds timeout for AWS services
const GLOBAL_CHECK_TIMEOUT = 90000; // 90 seconds timeout for the entire health check

const BUILD_VERSION = process.env.BUILD_VERSION || "development";
const COMMIT_HASH = process.env.COMMIT_HASH || "unknown";
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString();

const ENABLE_OPENTELEMETRY =
  (process.env.ENABLE_OPENTELEMETRY ?? Bun?.env?.ENABLE_OPENTELEMETRY) === "true";

// Checks that only apply to a specific RAG pipeline
const PIPELINE_SPECIFIC_CHECKS: Record<string, string[]> = {
  "Pinecone API": ["PINECONE"],
  "AWS Knowledge Base": ["AWS_KNOWLEDGE_BASE"],
};

function isCheckRelevant(checkName: string, activePipeline: string): boolean {
  const pipelines = PIPELINE_SPECIFIC_CHECKS[checkName];
  if (!pipelines) return true;
  return pipelines.includes(activePipeline);
}

function getTelemetryStatus() {
  if (!ENABLE_OPENTELEMETRY) {
    return { enabled: false };
  }

  try {
    const circuitBreakers = getCircuitBreakerStatus();
    const exportStats = formatExportStats();
    const cardinality = getCardinalityStatus();

    return {
      enabled: true,
      circuitBreakers: {
        traces: circuitBreakers.traces.stateName,
        metrics: circuitBreakers.metrics.stateName,
        logs: circuitBreakers.logs.stateName,
      },
      exportStats,
      cardinality: {
        uniqueLabels: cardinality.uniqueLabels,
        maxLabels: cardinality.maxLabels,
        usagePercent: cardinality.usagePercent.toFixed(1),
        warningLevel: cardinality.warningLevel,
      },
    };
  } catch (error) {
    return {
      enabled: true,
      error: "Failed to retrieve telemetry status",
    };
  }
}

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
        "Content-Type": "application/x-protobuf",
        Accept: "application/x-protobuf",
      },
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
  return checkOpenTelemetryEndpoint(backendConfig.openTelemetry.TRACES_ENDPOINT, "Traces", fetch);
}

async function checkMetricsEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(backendConfig.openTelemetry.METRICS_ENDPOINT, "Metrics", fetch);
}

async function checkLogsEndpoint(fetch: typeof global.fetch): Promise<CheckResult> {
  return checkOpenTelemetryEndpoint(backendConfig.openTelemetry.LOGS_ENDPOINT, "Logs", fetch);
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

async function checkCapellaAPI(_fetch: typeof global.fetch): Promise<CheckResult> {
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
    if (errorMessage.includes("SELF_SIGNED_CERT_IN_CHAIN")) {
      return {
        status: "ERROR",
        message: "SSL Certificate validation failed for Capella API",
        responseTime: duration,
        details: errorMessage,
      };
    }

    err("Capella Cloud API health check failed:", {
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString(),
    });
    return {
      status: "ERROR",
      message: errorMessage,
      responseTime: duration,
    };
  }
}

async function checkDatabase(_fetch: typeof global.fetch): Promise<CheckResult> {
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
        `Failed to fetch collections. Status: ${response.status}, Error: ${errorText}`
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
        Accept: "*/*",
        "Content-Type": "application/json",
      },
    });

    const duration = Date.now() - startTime;

    if (response.ok || response.status === 405) {
      // 405 is acceptable as it may require POST
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
    if (errorMessage.includes("certificate")) {
      return {
        status: "ERROR",
        message: "SSL Certificate validation failed for OpenReplay endpoint",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ECONNREFUSED")) {
      return {
        status: "ERROR",
        message: "Connection refused to OpenReplay endpoint",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ETIMEDOUT")) {
      return {
        status: "ERROR",
        message: "Connection timed out to OpenReplay endpoint",
        responseTime: duration,
      };
    }

    err("OpenReplay endpoint health check failed:", {
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString(),
    });

    return {
      status: "ERROR",
      message: "Failed to connect to OpenReplay endpoint",
      responseTime: duration,
    };
  }
}

async function checkPineconeEndpoint(_fetch: typeof global.fetch): Promise<CheckResult> {
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
    if (errorMessage.includes("401")) {
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
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      timestamp: new Date().toISOString(),
    });

    return {
      status: "ERROR",
      message: "Failed to connect to LangSmith API",
      responseTime: duration,
    };
  }
}

async function checkAWSConfiguration(_fetch: typeof global.fetch): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const region = backendConfig.rag.AWS_REGION;
    const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
    const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;
    const knowledgeBaseId = backendConfig.rag.KNOWLEDGE_BASE_ID;

    const duration = Date.now() - startTime;

    const missingConfigs = [];
    if (!region) missingConfigs.push("AWS_REGION");
    if (!accessKeyId) missingConfigs.push("AWS_ACCESS_KEY_ID");
    if (!secretAccessKey) missingConfigs.push("AWS_SECRET_ACCESS_KEY");
    if (!knowledgeBaseId) missingConfigs.push("KNOWLEDGE_BASE_ID");

    if (missingConfigs.length > 0) {
      return {
        status: "ERROR",
        message: `Missing AWS configuration: ${missingConfigs.join(", ")} (key: ${redactCredential(accessKeyId)})`,
        responseTime: duration,
      };
    }

    return {
      status: "OK",
      message: `AWS configuration is complete (Region: ${region}, Key: ${redactCredential(accessKeyId)})`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    err("AWS configuration check failed:", error);
    return {
      status: "ERROR",
      message: errorMessage,
      responseTime: duration,
    };
  }
}

async function checkCredentialConsistency(_fetch: typeof global.fetch): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const diagnostics = getCredentialDiagnostics();
    const duration = Date.now() - startTime;

    if (diagnostics.consistency.allMatch) {
      return {
        status: "OK",
        message: "All credential sources (backendConfig, Bun.env, process.env) are consistent",
        responseTime: duration,
      };
    }

    const mismatches: string[] = [];
    if (!diagnostics.consistency.accessKeyIdMatch) mismatches.push("AWS_ACCESS_KEY_ID");
    if (!diagnostics.consistency.secretAccessKeyMatch) mismatches.push("AWS_SECRET_ACCESS_KEY");
    if (!diagnostics.consistency.regionMatch) mismatches.push("AWS_REGION");

    log("[HealthCheck] Credential source mismatch detected", diagnostics.sources);

    return {
      status: "WARNING",
      message: `Credential sources are inconsistent for: ${mismatches.join(", ")}. Check server logs for source details.`,
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      responseTime: duration,
    };
  }
}

async function checkBedrockChatEndpoint(_fetch: typeof global.fetch): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const region = backendConfig.rag.AWS_REGION;
    const chatModel = backendConfig.rag.BEDROCK_CHAT_MODEL;
    const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
    const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

    if (!region) {
      return {
        status: "ERROR",
        message: "AWS_REGION is required for Bedrock chat",
        responseTime: 0,
      };
    }

    if (!accessKeyId || !secretAccessKey) {
      return {
        status: "ERROR",
        message: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock chat",
        responseTime: 0,
      };
    }

    const client = new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 3,
      retryMode: "adaptive",
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
      }),
    });

    const command = new ConverseCommand({
      modelId: chatModel,
      messages: [
        {
          role: "user",
          content: [{ text: "ping" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 10,
        temperature: 0,
      },
    });

    const response = await client.send(command);
    const duration = Date.now() - startTime;

    if (response.output?.message?.content) {
      return {
        status: "OK",
        message: `Bedrock chat model ${chatModel} is responsive`,
        responseTime: duration,
      };
    }

    return {
      status: "ERROR",
      message: "Bedrock chat model returned unexpected response",
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const keyFingerprint = redactCredential(backendConfig.rag.AWS_ACCESS_KEY_ID);

    if (errorMessage.includes("ValidationException")) {
      return {
        status: "ERROR",
        message: "Bedrock chat model validation failed - check model ID",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("UnauthorizedOperation") || errorMessage.includes("AccessDenied")) {
      return {
        status: "ERROR",
        message: `AWS credentials lack Bedrock chat permissions (key: ${keyFingerprint})`,
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ThrottlingException")) {
      return {
        status: "WARNING",
        message: "Bedrock chat model is throttled",
        responseTime: duration,
      };
    }

    err("Bedrock chat endpoint health check failed:", { error: errorMessage, keyFingerprint });
    return {
      status: "ERROR",
      message: `${errorMessage} (key: ${keyFingerprint})`,
      responseTime: duration,
    };
  }
}

async function checkBedrockEmbeddingEndpoint(_fetch: typeof global.fetch): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const region = backendConfig.rag.AWS_REGION;
    const embeddingModel = backendConfig.rag.BEDROCK_EMBEDDING_MODEL;
    const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
    const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

    if (!region) {
      return {
        status: "ERROR",
        message: "AWS_REGION is required for Bedrock embeddings",
        responseTime: 0,
      };
    }

    if (!accessKeyId || !secretAccessKey) {
      return {
        status: "ERROR",
        message: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock embeddings",
        responseTime: 0,
      };
    }

    const embeddingClient = new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 3,
      retryMode: "adaptive",
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
      }),
    });

    const command = new InvokeModelCommand({
      modelId: embeddingModel,
      body: JSON.stringify({
        inputText: "health check test",
      }),
    });

    const response = await embeddingClient.send(command);
    const duration = Date.now() - startTime;

    if (response.body) {
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      if (responseBody.embedding && Array.isArray(responseBody.embedding)) {
        const expectedDimensions = embeddingModel.includes("titan-embed-text-v1")
          ? 1536
          : embeddingModel.includes("titan-embed-text-v2")
            ? 1024
            : 1536;
        const actualDimensions = responseBody.embedding.length;

        if (actualDimensions === expectedDimensions) {
          return {
            status: "OK",
            message: `Bedrock embedding model ${embeddingModel} is responsive (${actualDimensions} dimensions)`,
            responseTime: duration,
          };
        } else {
          return {
            status: "WARNING",
            message: `Bedrock embedding model ${embeddingModel} returned unexpected dimensions (${actualDimensions}, expected ${expectedDimensions})`,
            responseTime: duration,
          };
        }
      }
    }

    return {
      status: "ERROR",
      message: "Bedrock embedding model returned unexpected response",
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const keyFingerprint = redactCredential(backendConfig.rag.AWS_ACCESS_KEY_ID);

    if (errorMessage.includes("ValidationException")) {
      return {
        status: "ERROR",
        message: "Bedrock embedding model validation failed - check model ID",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("UnauthorizedOperation") || errorMessage.includes("AccessDenied")) {
      return {
        status: "ERROR",
        message: `AWS credentials lack Bedrock embedding permissions (key: ${keyFingerprint})`,
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ThrottlingException")) {
      return {
        status: "WARNING",
        message: "Bedrock embedding model is throttled",
        responseTime: duration,
      };
    }

    err("Bedrock embedding endpoint health check failed:", { error: errorMessage, keyFingerprint });
    return {
      status: "ERROR",
      message: `${errorMessage} (key: ${keyFingerprint})`,
      responseTime: duration,
    };
  }
}

async function checkKnowledgeBaseEndpoint(_fetch: typeof global.fetch): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const region = backendConfig.rag.AWS_REGION;
    const knowledgeBaseId = backendConfig.rag.KNOWLEDGE_BASE_ID;
    const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
    const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

    if (!region || !knowledgeBaseId) {
      return {
        status: "ERROR",
        message: "AWS_REGION and KNOWLEDGE_BASE_ID are required",
        responseTime: 0,
      };
    }

    if (!accessKeyId || !secretAccessKey) {
      return {
        status: "ERROR",
        message: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Knowledge Base",
        responseTime: 0,
      };
    }

    const knowledgeBaseClient = new BedrockAgentRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 3,
      retryMode: "adaptive",
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
      }),
    });

    // Test with a simple health check query
    const command = new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: {
        text: "health",
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 1,
        },
      },
    });

    const response = await knowledgeBaseClient.send(command);
    const duration = Date.now() - startTime;

    if (response.retrievalResults !== undefined) {
      const resultCount = response.retrievalResults.length;
      return {
        status: "OK",
        message: `AWS Knowledge Base ${knowledgeBaseId} is responsive (${resultCount} results returned)`,
        responseTime: duration,
      };
    }

    return {
      status: "ERROR",
      message: "Knowledge Base returned unexpected response",
      responseTime: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle specific AWS errors
    if (errorMessage.includes("ResourceNotFoundException")) {
      return {
        status: "ERROR",
        message: "Knowledge Base not found - check KNOWLEDGE_BASE_ID",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ValidationException")) {
      return {
        status: "ERROR",
        message: "Knowledge Base request validation failed",
        responseTime: duration,
      };
    }

    if (errorMessage.includes("UnauthorizedOperation") || errorMessage.includes("AccessDenied")) {
      const keyFingerprint = redactCredential(backendConfig.rag.AWS_ACCESS_KEY_ID);
      return {
        status: "ERROR",
        message: `AWS credentials lack Knowledge Base permissions (key: ${keyFingerprint})`,
        responseTime: duration,
      };
    }

    if (errorMessage.includes("ThrottlingException")) {
      return {
        status: "WARNING",
        message: "Knowledge Base is throttled",
        responseTime: duration,
      };
    }

    err("Knowledge Base endpoint health check failed:", error);
    return {
      status: "ERROR",
      message: errorMessage,
      responseTime: duration,
    };
  }
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
            timestamp: new Date().toISOString(),
          });

          const checkType = url.searchParams.get("type") || "Simple";
          const isSimpleCheck = checkType === "Simple";

          const healthStatus: Record<string, CheckResult> = {};
          const failedChecks: string[] = [];

          const simpleChecks = [
            { name: "Internal Collections API", check: () => checkInternalAPI(fetch) },
            { name: "SQLite Database", check: () => checkDatabase(fetch) },
            { name: "GraphQL Endpoint", check: () => checkGraphQLEndpoint(fetch) },
          ].sort((a, b) => a.name.localeCompare(b.name));

          const activePipeline = backendConfig.rag.RAG_PIPELINE;

          const detailedChecks = [
            ...simpleChecks,
            { name: "AWS Configuration", check: () => checkAWSConfiguration(fetch) },
            { name: "AWS Credential Consistency", check: () => checkCredentialConsistency(fetch) },
            { name: "AWS Bedrock Chat Model", check: () => checkBedrockChatEndpoint(fetch) },
            {
              name: "AWS Bedrock Embedding Model",
              check: () => checkBedrockEmbeddingEndpoint(fetch),
            },
            { name: "AWS Knowledge Base", check: () => checkKnowledgeBaseEndpoint(fetch) },
            { name: "Elastic APM Server", check: () => checkElasticAPMEndpoint(fetch) },
            { name: "External Capella Cloud API", check: () => checkCapellaAPI(fetch) },
            { name: "OpenReplay Endpoint", check: () => checkOpenReplayEndpoint(fetch) },
            { name: "Pinecone API", check: () => checkPineconeEndpoint(fetch) },
            { name: "LangSmith API", check: () => checkLangSmithEndpoint(fetch) },
            { name: "OpenTelemetry Logs Endpoint", check: () => checkLogsEndpoint(fetch) },
            { name: "OpenTelemetry Metrics Endpoint", check: () => checkMetricsEndpoint(fetch) },
            { name: "OpenTelemetry Traces Endpoint", check: () => checkTracesEndpoint(fetch) },
          ]
            .filter(({ name }) => isCheckRelevant(name, activePipeline))
            .sort((a, b) => a.name.localeCompare(b.name));

          // Modify the Promise.all to ensure individual check failures don't stop other checks
          await Promise.allSettled(
            (isSimpleCheck ? simpleChecks : detailedChecks).map(async ({ name, check }) => {
              try {
                log(`Starting check: ${name}`);

                const result = await Promise.race([
                  check(),
                  new Promise<CheckResult>((_, reject) =>
                    setTimeout(
                      () => reject(new Error(`Timeout: ${name} check took too long`)),
                      name === "External Capella Cloud API"
                        ? CAPELLA_API_TIMEOUT
                        : name.startsWith("AWS")
                          ? AWS_API_TIMEOUT
                          : INDIVIDUAL_CHECK_TIMEOUT
                    )
                  ),
                ]);

                log(`Check completed: ${name}`, {
                  status: result.status,
                  responseTime: result.responseTime,
                });

                healthStatus[name] = result;

                if (result.status === "ERROR") {
                  failedChecks.push(name);
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                err(`Health check failed for ${name}:`, {
                  error: errorMessage,
                  timestamp: new Date().toISOString(),
                });

                // Ensure we still record a result even on error
                healthStatus[name] = {
                  status: "ERROR",
                  message: `Check failed: ${errorMessage}`,
                  responseTime: 0,
                };
                failedChecks.push(name);
              }
            })
          );

          // Determine overall status - only mark as ERROR if all checks failed
          const allChecksFailed = Object.values(healthStatus).every((s) => s.status === "ERROR");
          const finalStatus = allChecksFailed
            ? "ERROR"
            : failedChecks.length > 0
              ? "WARNING"
              : "OK";

          log("Health check completed", {
            status: finalStatus,
            checkType,
            failedChecks,
            results: Object.fromEntries(
              Object.entries(healthStatus).map(([k, v]) => [
                k,
                {
                  status: v.status,
                  responseTime: v.responseTime,
                  message: v.message,
                },
              ])
            ),
          });

          return json({
            status: finalStatus,
            version: {
              build: BUILD_VERSION,
              commit: COMMIT_HASH,
              buildDate: BUILD_DATE,
            },
            ragPipeline: activePipeline,
            telemetry: getTelemetryStatus(),
            checks: healthStatus,
            checkType: checkType,
            failedChecks: failedChecks.length > 0 ? failedChecks : undefined,
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
              buildDate: BUILD_DATE,
            },
            checks: {},
            checkType: url.searchParams.get("type") || "Simple",
            failedChecks: [],
          });
        }
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health check timed out")), GLOBAL_CHECK_TIMEOUT)
      ),
    ]);

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    err("Unhandled health check error:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Return a more graceful error response
    return json(
      {
        status: "WARNING",
        message: "Health check encountered issues",
        error: {
          message: errorMessage,
          stack:
            process.env.NODE_ENV === "development"
              ? error instanceof Error
                ? error.stack
                : undefined
              : undefined,
        },
      },
      {
        status: 200, // Return 200 instead of 500 to prevent cascading failures
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      }
    );
  }
}
