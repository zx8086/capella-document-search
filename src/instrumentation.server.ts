// src/instrumentation.server.ts
// SvelteKit native instrumentation entry point (SIO-359, SIO-371)

import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { backendConfig } from "./backend-config";
import { initializeCardinalityGuard } from "./otel/cardinality-guard";
import { initializeExportStatsTracker } from "./otel/export-stats-tracker";
import { initializeTelemetryLifecycle } from "./otel/lifecycle";
import { initializeOtelLogger } from "./otel/logger";
import { initializeMetrics } from "./otel/metrics";
import { createSampler } from "./otel/sampling";
import { initializeTelemetryCircuitBreakers } from "./otel/telemetry-circuit-breaker";
import {
  createWrappedLogExporter,
  createWrappedMetricExporter,
  createWrappedSpanExporter,
} from "./otel/wrapped-exporters";

const INSTRUMENTATION_ENABLED =
  (Bun.env["ENABLE_OPENTELEMETRY"] as string) === "true" &&
  Bun.env["DISABLE_OPENTELEMETRY"] !== "true";

if (typeof Bun !== "undefined") {
  Bun.env.OTEL_NODE_RESOURCE_DETECTORS = "env,host,os,serviceinstance";
} else {
  process.env.OTEL_NODE_RESOURCE_DETECTORS = "env,host,os,serviceinstance";
}

let sdk: NodeSDK | undefined;

const createResource = () => {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
    ["deployment.environment"]: backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    ["service.namespace"]: "capella-document-search",
    ["service.instance.id"]:
      (typeof Bun !== "undefined" ? Bun.env.HOSTNAME : process.env.HOSTNAME) || "unknown",
    ["telemetry.sdk.name"]: "opentelemetry",
    ["telemetry.sdk.language"]: "nodejs",
    ["telemetry.sdk.version"]: "2.0.1",
    ["runtime.name"]: typeof Bun !== "undefined" ? "bun" : "node",
    ["runtime.version"]: typeof Bun !== "undefined" ? Bun.version : process.version,
  });
};

const exporterTimeout = backendConfig.openTelemetry.EXPORT_TIMEOUT;
const commonConfig = {
  timeoutMillis: exporterTimeout,
  concurrencyLimit: 100,
  keepAlive: true,
  headers: {
    "Content-Type": "application/x-protobuf",
  },
};

async function initializeOpenTelemetry() {
  if (!INSTRUMENTATION_ENABLED) {
    console.log("[OTel] OpenTelemetry instrumentation is disabled");
    return;
  }

  try {
    console.log("[OTel] Initializing SvelteKit native instrumentation...");
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

    // Initialize resilience components (SIO-371)
    initializeTelemetryCircuitBreakers();
    initializeExportStatsTracker();
    initializeCardinalityGuard();

    const resource = createResource();

    // Create base exporters
    const baseTraceExporter = new OTLPTraceExporter({
      url: backendConfig.openTelemetry.TRACES_ENDPOINT,
      ...commonConfig,
    });

    const baseMetricExporter = new OTLPMetricExporter({
      url: backendConfig.openTelemetry.METRICS_ENDPOINT,
      ...commonConfig,
    });

    const baseLogExporter = new OTLPLogExporter({
      url: backendConfig.openTelemetry.LOGS_ENDPOINT,
      ...commonConfig,
    });

    // Wrap exporters with circuit breaker and stats tracking (SIO-371)
    const traceExporter = createWrappedSpanExporter(baseTraceExporter);
    const metricExporter = createWrappedMetricExporter(baseMetricExporter);
    const logExporter = createWrappedLogExporter(baseLogExporter);

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: backendConfig.openTelemetry.METRIC_READER_INTERVAL,
      exportTimeoutMillis: exporterTimeout,
    });

    const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
      maxExportBatchSize: backendConfig.openTelemetry.BATCH_SIZE,
      maxQueueSize: backendConfig.openTelemetry.QUEUE_SIZE,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: exporterTimeout,
    });

    const batchLogProcessor = new BatchLogRecordProcessor(logExporter, {
      maxExportBatchSize: backendConfig.openTelemetry.BATCH_SIZE,
      maxQueueSize: backendConfig.openTelemetry.QUEUE_SIZE,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: exporterTimeout,
    });

    const sampler = createSampler({
      samplingRate: backendConfig.openTelemetry.SAMPLING_RATE,
      environment: backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    });

    const textMapPropagator = new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    });

    sdk = new NodeSDK({
      resource: resource,
      spanProcessors: [batchSpanProcessor],
      logRecordProcessors: [batchLogProcessor],
      metricReader: metricReader,
      sampler: sampler,
      textMapPropagator: textMapPropagator,
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-dns": { enabled: false },
          "@opentelemetry/instrumentation-net": { enabled: false },
          "@opentelemetry/instrumentation-winston": { enabled: false },
          "@opentelemetry/instrumentation-runtime-node": { enabled: false },
          "@opentelemetry/instrumentation-http": { enabled: true },
          "@opentelemetry/instrumentation-fastify": { enabled: false },
        }),
        new GraphQLInstrumentation({
          allowValues: true,
          depth: -1,
        }),
      ],
    });

    await sdk.start();
    console.log("[OTel] SvelteKit native instrumentation started");
    console.log(`   - Service: ${backendConfig.openTelemetry.SERVICE_NAME}`);
    console.log(`   - Version: ${backendConfig.openTelemetry.SERVICE_VERSION}`);
    console.log(`   - Environment: ${backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT}`);
    console.log(`   - Sampling: ${backendConfig.openTelemetry.SAMPLING_RATE * 100}%`);
    console.log("   - Resilience: Circuit breakers + Cardinality guard enabled");

    initializeMetrics(backendConfig);
    initializeOtelLogger(backendConfig);

    // Initialize lifecycle handlers (SIO-375)
    initializeTelemetryLifecycle(sdk);
  } catch (error) {
    console.error("[OTel] Failed to initialize:", error);
  }
}

initializeOpenTelemetry().catch(console.error);

export const otelSDK = sdk;
