/* src/instrumentation.ts */

console.log("Starting Application - Couchbase Capella Document Search Application");

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import type { Resource } from "@opentelemetry/resources";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { backendConfig } from "./backend-config";

console.log("Starting OpenTelemetry instrumentation...");

const INSTRUMENTATION_ENABLED =
  (Bun.env["ENABLE_OPENTELEMETRY"] as string) === "true" &&
  Bun.env["DISABLE_OPENTELEMETRY"] !== "true";

console.log("OpenTelemetry enabled:", { INSTRUMENTATION_ENABLED });

let sdk: NodeSDK | undefined;

const createResource = () => {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
    ["deployment.environment"]:
      backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
  });
};

const exporterTimeout = 300000; // 5 minutes

async function initializeOpenTelemetry() {
  if (INSTRUMENTATION_ENABLED) {
    try {
      console.log("Initializing OpenTelemetry SDK...");
      // Reduce OpenTelemetry diagnostic verbosity to prevent duplicate console logs
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

      const resource = createResource();

      const traceExporter = new OTLPTraceExporter({
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        timeoutMillis: exporterTimeout,
      });

      console.log("Traces exporter created with config:", {
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        timeout: exporterTimeout,
      });

      const logExporter = new OTLPLogExporter({
        url: backendConfig.openTelemetry.LOGS_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        timeoutMillis: exporterTimeout,
      });

      console.log("Logs exporter created with config:", {
        url: backendConfig.openTelemetry.LOGS_ENDPOINT,
        timeout: exporterTimeout,
      });

      const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: exporterTimeout,
      });

      const batchLogProcessor = new BatchLogRecordProcessor(logExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: exporterTimeout,
      });

      sdk = new NodeSDK({
        resource: resource,
        spanProcessors: [batchSpanProcessor],
        logRecordProcessors: [batchLogProcessor],
        instrumentations: [
          getNodeAutoInstrumentations({
            "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
            "@opentelemetry/instrumentation-fs": { enabled: false },
            "@opentelemetry/instrumentation-winston": { enabled: false },
            "@opentelemetry/instrumentation-runtime-node": { enabled: false },
            "@opentelemetry/instrumentation-http": { enabled: true },
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
      console.log("OpenTelemetry SDK started");

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
            setTimeout(() => process.exit(0), 1000);
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
