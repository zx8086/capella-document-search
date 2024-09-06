/* src/instrumentation.ts */

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import * as api from "@opentelemetry/api-logs";
import backendConfig from "./backend-config";

declare global {
  var INSTRUMENTATION_ENABLED: boolean;
}

const INSTRUMENTATION_ENABLED = process.env.ENABLE_OPENTELEMETRY === "true";
console.log("INSTRUMENTATION_ENABLED:", INSTRUMENTATION_ENABLED);
console.log(
  "process.env.ENABLE_OPENTELEMETRY:",
  process.env.ENABLE_OPENTELEMETRY,
);

let sdk: NodeSDK | undefined;
let meter: any;

if (INSTRUMENTATION_ENABLED) {
  console.log("Initializing OpenTelemetry SDK...");

  // Set up diagnostics logging with increased verbosity
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  // Create a shared resource
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
      backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
  });

  // Create OTLP exporters with updated configurations
  const traceExporter = new OTLPTraceExporter({
    url: backendConfig.openTelemetry.TRACES_ENDPOINT,
    concurrencyLimit: 50,
    headers: { "Content-Type": "application/json" },
    timeoutMillis: 30000,
  });

  const otlpMetricExporter = new OTLPMetricExporter({
    url: backendConfig.openTelemetry.METRICS_ENDPOINT,
    headers: { "Content-Type": "application/json" },
    timeoutMillis: 30000,
  });

  const logExporter = new OTLPLogExporter({
    url: backendConfig.openTelemetry.LOGS_ENDPOINT,
    headers: { "Content-Type": "application/json" },
    timeoutMillis: 30000,
  });

  // Set up LoggerProvider
  const loggerProvider = new LoggerProvider({ resource });
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(logExporter, {
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
  );
  api.logs.setGlobalLoggerProvider(loggerProvider);

  const otlpMetricReader = new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: backendConfig.openTelemetry.METRIC_READER_INTERVAL,
  });

  // Set up MeterProvider
  const meterProvider = new MeterProvider({
    resource: resource,
    readers: [otlpMetricReader],
  });

  // Set this MeterProvider to be global to the app being instrumented.
  metrics.setGlobalMeterProvider(meterProvider);

  // Create a BatchSpanProcessor with custom configuration and logging
  const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  });

  // Add custom logging to the BatchSpanProcessor
  const originalOnEnd = batchSpanProcessor.onEnd.bind(batchSpanProcessor);
  batchSpanProcessor.onEnd = (span) => {
    console.log(`Processing span: ${span.name}`);
    return originalOnEnd(span);
  };

  // Node SDK for OpenTelemetry
  sdk = new NodeSDK({
    resource: resource,
    traceExporter,
    spanProcessors: [batchSpanProcessor],
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-winston": { enabled: false },
      }),
      new GraphQLInstrumentation({
        allowValues: true,
        depth: -1,
      }),
      new WinstonInstrumentation({
        enabled: true,
        disableLogSending: true,
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log("OpenTelemetry SDK started with auto-instrumentation");

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk
      ?.shutdown()
      .then(() => console.log("SDK shut down successfully"))
      .catch((error) => console.error("Error shutting down SDK", error))
      .finally(() => process.exit(0));
  });

  meter = metrics.getMeter(
    backendConfig.openTelemetry.SERVICE_NAME,
    backendConfig.openTelemetry.SERVICE_VERSION,
  );
} else {
  console.log("OpenTelemetry instrumentation is disabled");
}

export const otelSDK = sdk;
export { meter };
