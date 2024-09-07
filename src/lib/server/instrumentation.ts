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
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
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

import * as api from "@opentelemetry/api-logs";
import { config } from "$config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});
// Create OTLP exporters
const traceExporter = new OTLPTraceExporter({
  url: config.openTelemetry.TRACES_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const metricExporter = new OTLPMetricExporter({
  url: config.openTelemetry.METRICS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const logExporter = new OTLPLogExporter({
  url: config.openTelemetry.LOGS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

// Set up LoggerProvider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
api.logs.setGlobalLoggerProvider(loggerProvider);

// Set up MeterProvider
const meterProvider = new MeterProvider({
  resource: resource,
  readers: [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
    }),
  ],
});

// Set the MeterProvider to be global
metrics.setGlobalMeterProvider(meterProvider);

// Create the NodeSDK instance
const sdk = new NodeSDK({
  resource: resource,
  traceExporter,
  spanProcessor: new BatchSpanProcessor(traceExporter),
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
  }),
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
    new WinstonInstrumentation({
      enabled: true,
      logHook: (span, record) => {
        record["resource.service.name"] = config.openTelemetry.SERVICE_NAME;
      },
    }),
  ],
});

export function startInstrumentation() {
  try {
    sdk.start();
    console.log("OpenTelemetry SDK started with auto-instrumentation");

    // Test log
    const logger = api.logs.getLogger("test-logger");
    logger.info("Test log after SDK start");
  } catch (error) {
    console.error("Error starting OpenTelemetry SDK:", error);
  }
}
// Graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("SDK shut down successfully"))
    .catch((error) => console.log("Error shutting down SDK", error))
    .finally(() => process.exit(0));
});

export const otelSDK = sdk;
export const meter = metrics.getMeter(
  config.openTelemetry.SERVICE_NAME,
  config.openTelemetry.SERVICE_VERSION,
);
