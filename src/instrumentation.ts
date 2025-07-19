/* src/instrumentation.ts */

import { debug, log, warn, err } from "./utils/browserLogger";

log("Starting Application - Couchbase Capella Document Search Application");

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { backendConfig } from "./backend-config";

log("Starting OpenTelemetry instrumentation...");

const INSTRUMENTATION_ENABLED =
  (Bun.env["ENABLE_OPENTELEMETRY"] as string) === "true" &&
  Bun.env["DISABLE_OPENTELEMETRY"] !== "true";

log("OpenTelemetry enabled:", { INSTRUMENTATION_ENABLED });

let sdk: NodeSDK | undefined;

const createResource = async () => {
  const { defaultResource, resourceFromAttributes } = await import(
    "@opentelemetry/resources"
  );
  return (await defaultResource()).merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: backendConfig.openTelemetry.SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: backendConfig.openTelemetry.SERVICE_VERSION,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        backendConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    }),
  );
};

const exporterTimeout = 300000; // 5 minutes

async function initializeOpenTelemetry() {
  if (INSTRUMENTATION_ENABLED) {
    try {
      log("Initializing OpenTelemetry SDK...");
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

      const resource = await createResource();

      const traceExporter = new OTLPTraceExporter({
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        headers: { "Content-Type": "application/json" },
        timeoutMillis: exporterTimeout,
      });

      log("Traces exporter created with config:", {
        url: backendConfig.openTelemetry.TRACES_ENDPOINT,
        timeout: exporterTimeout,
      });


      const batchSpanProcessor = new BatchSpanProcessor(traceExporter, {
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: exporterTimeout,
      });

      sdk = new NodeSDK({
        resource: resource,
        spanProcessors: [batchSpanProcessor],
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
      log("OpenTelemetry SDK started");

      process.on("SIGTERM", () => {
        const shutdownTimeout = setTimeout(() => {
          err("SDK shutdown timed out, forcing exit");
          process.exit(1);
        }, 5000);

        sdk
          ?.shutdown()
          .then(() => {
            clearTimeout(shutdownTimeout);
            log("SDK shut down successfully");
            setTimeout(() => process.exit(0), 1000);
          })
          .catch((error) => {
            clearTimeout(shutdownTimeout);
            err("Error shutting down SDK", error);
            process.exit(1);
          });
      });
    } catch (error) {
      err("Error initializing OpenTelemetry SDK:", error);
    }
  } else {
    log("OpenTelemetry instrumentation is disabled");
  }
}

initializeOpenTelemetry().catch(console.error);


export const otelSDK = sdk;
