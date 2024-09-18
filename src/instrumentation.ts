/* src/instrumentation.ts */

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
  type Meter,
  type Counter,
  type Histogram,
} from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { MonitoredOTLPTraceExporter } from "./otlp/MonitoredOTLPTraceExporter";
import { MonitoredOTLPMetricExporter } from "./otlp/MonitoredOTLPMetricExporter";
import { MonitoredOTLPLogExporter } from "./otlp/MonitoredOTLPLogExporter";
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
import { backendConfig } from "$backendConfig";

const INSTRUMENTATION_ENABLED =
  (process.env["ENABLE_OPENTELEMETRY"] as string) === "true";
console.log("INSTRUMENTATION_ENABLED:", INSTRUMENTATION_ENABLED);

let sdk: NodeSDK | undefined;
let meter: Meter | undefined;
let httpRequestCounter: Counter | undefined;
let httpResponseTimeHistogram: Histogram | undefined;

const createResource = async () => {
  return Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    }),
  );
};

const commonConfig = {
  timeoutMillis: 120000,
  concurrencyLimit: 100,
};

export function initializeHttpMetrics() {
  if (INSTRUMENTATION_ENABLED && meter) {
    console.debug("Initializing HTTP metrics");
    try {
      httpRequestCounter = meter.createCounter("http_requests_total", {
        description: "Count of HTTP requests",
      });
      console.debug("HTTP request counter created");

      httpResponseTimeHistogram = meter.createHistogram(
        "http_response_time_seconds",
        {
          description: "HTTP response time in seconds",
        },
      );
      console.debug("HTTP response time histogram created");

      console.debug("HTTP metrics initialized successfully");
    } catch (error) {
      console.error("Error initializing HTTP metrics:", error);
    }
  } else {
    console.debug(
      "HTTP metrics initialization skipped (instrumentation disabled or meter not available)",
    );
  }
}

async function initializeOpenTelemetry() {
  if (INSTRUMENTATION_ENABLED) {
    try {
      console.log("Initializing OpenTelemetry SDK...");
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

      const resource = await createResource();

      const traceExporter = new MonitoredOTLPTraceExporter({
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        ...commonConfig,
      });
      console.log("Metric exporter created with config:", {
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        interval: backendConfig.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      const otlpMetricExporter = new MonitoredOTLPMetricExporter({
        url: backendConfig.openTelemetry.METRICS_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        ...commonConfig,
      });
      console.log("Metric exporter created with config:", {
        url: backendConfig.openTelemetry.METRICS_ENDPOINT,
        interval: backendConfig.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      const logExporter = new MonitoredOTLPLogExporter({
        url: backendConfig.openTelemetry.LOGS_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        ...commonConfig,
      });
      console.log("Metric exporter created with config:", {
        url: backendConfig.openTelemetry.LOGS_ENDPOINT,
        interval: backendConfig.openTelemetry.METRIC_READER_INTERVAL,
        summaryInterval: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
      });

      const loggerProvider = new LoggerProvider({ resource });
      loggerProvider.addLogRecordProcessor(
        new BatchLogRecordProcessor(logExporter, {
          maxExportBatchSize: 100,
          scheduledDelayMillis: 10000,
          exportTimeoutMillis: 60000,
        }),
      );
      api.logs.setGlobalLoggerProvider(loggerProvider);

      const otlpMetricReader = new PeriodicExportingMetricReader({
        exporter: otlpMetricExporter,
        exportIntervalMillis:
          backendConfig.openTelemetry.METRIC_READER_INTERVAL,
      });

      // Create MeterProvider separately
      const meterProvider = new MeterProvider({
        resource: resource,
        readers: [otlpMetricReader],
      });

      // Set the global MeterProvider
      metrics.setGlobalMeterProvider(meterProvider);

      try {
        meter = metrics.getMeter(
          backendConfig.openTelemetry.SERVICE_NAME,
          backendConfig.openTelemetry.SERVICE_VERSION,
        );
        if (!meter) {
          console.warn("Failed to get meter from global MeterProvider");
        } else {
          console.debug("Meter created successfully");
        }
      } catch (error) {
        console.error("Error getting meter:", error);
      }

      const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      });

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

      sdk.start();
      console.log("OpenTelemetry SDK started with auto-instrumentation");

      initializeHttpMetrics();

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
}

initializeOpenTelemetry().catch(console.error);

export const otelSDK = sdk;

export function getMeter(): Meter | undefined {
  return meter;
}

export function recordHttpRequest(method: string, route: string) {
  if (INSTRUMENTATION_ENABLED && httpRequestCounter) {
    httpRequestCounter.add(1, { method, route });
    console.debug(`Recorded HTTP request: method=${method}, route=${route}`);
  } else if (!INSTRUMENTATION_ENABLED) {
    console.debug(`Skipped recording HTTP request: instrumentation disabled`);
  } else {
    console.debug(`Skipped recording HTTP request: counter not initialized`);
  }
}

export function recordHttpResponseTime(duration: number) {
  if (INSTRUMENTATION_ENABLED && httpResponseTimeHistogram) {
    httpResponseTimeHistogram.record(duration / 1000); // Convert ms to seconds
    console.debug(`Recorded HTTP response time: ${duration}ms`);
  } else if (!INSTRUMENTATION_ENABLED) {
    console.debug(
      `Skipped recording HTTP response time: instrumentation disabled`,
    );
  } else {
    console.debug(
      `Skipped recording HTTP response time: histogram not initialized`,
    );
  }
}
