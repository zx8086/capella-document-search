/* src/instrumentation.ts */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { config } from "$config";

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});

const traceExporter = new OTLPTraceExporter({
  url: config.openTelemetry.TRACES_ENDPOINT,
});

const metricExporter = new OTLPMetricExporter({
  url: config.openTelemetry.METRICS_ENDPOINT,
});

export const otelSDK = new NodeSDK({
  resource: resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
  }),
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [getNodeAutoInstrumentations()],
});

export function startInstrumentation() {
  otelSDK.start();
  console.log("OpenTelemetry instrumentation started");
}
