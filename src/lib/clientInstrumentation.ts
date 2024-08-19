import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { XMLHttpRequestInstrumentation } from "@opentelemetry/instrumentation-xml-http-request";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";

import { config } from "$config";

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});

const provider = new WebTracerProvider({ resource });

const exporter = new OTLPTraceExporter({
  url: config.openTelemetry.TRACES_ENDPOINT,
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [
    new UserInteractionInstrumentation(),
    new XMLHttpRequestInstrumentation(),
    new FetchInstrumentation(),
  ],
});

export const tracer = provider.getTracer(config.openTelemetry.SERVICE_NAME);
