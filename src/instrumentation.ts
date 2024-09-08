/* src/instrumentation.ts */

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
  type Meter,
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

const INSTRUMENTATION_ENABLED = process.env.ENABLE_OPENTELEMETRY === "true";
console.log("INSTRUMENTATION_ENABLED:", INSTRUMENTATION_ENABLED);
console.log(
  "process.env.ENABLE_OPENTELEMETRY:",
  process.env.ENABLE_OPENTELEMETRY,
);

let sdk: NodeSDK | undefined;

// Create a shared resource
const resource = new Resource({
  [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});

if (INSTRUMENTATION_ENABLED) {
  try {
    console.log("Initializing OpenTelemetry SDK...");

    // Set up diagnostics logging with increased verbosity
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

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

    // Create a BatchSpanProcessor with custom configuration
    const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    });

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
      const shutdownTimeout = setTimeout(() => {
        console.error("SDK shutdown timed out, forcing exit");
        process.exit(1);
      }, 5000);

      sdk
        ?.shutdown()
        .then(() => {
          clearTimeout(shutdownTimeout);
          console.log("SDK shut down successfully");
          process.exit(0);
        })
        .catch((error) => {
          clearTimeout(shutdownTimeout);
          console.error("Error shutting down SDK", error);
          process.exit(1);
        });
    });
  } catch (error) {
    console.error("Error initializing OpenTelemetry SDK:", error);
  }
} else {
  console.log("OpenTelemetry instrumentation is disabled");
}

export const otelSDK = sdk;

export function getMeter(): Meter | undefined {
  if (INSTRUMENTATION_ENABLED) {
    return metrics.getMeter(
      backendConfig.openTelemetry.SERVICE_NAME,
      backendConfig.openTelemetry.SERVICE_VERSION,
    );
  }
  return undefined;
}
