// src/lib/tracing/api-utils.ts
// API route tracing wrapper (SIO-368)

import { trace, type Span, type Attributes, SpanStatusCode } from "@opentelemetry/api";
import type { RequestEvent, RequestHandler } from "@sveltejs/kit";

const ENABLE_TRACING =
  (typeof process !== "undefined" && process.env?.ENABLE_OPENTELEMETRY === "true") ||
  (typeof Bun !== "undefined" && Bun.env?.ENABLE_OPENTELEMETRY === "true");

const tracer = trace.getTracer("capella-document-search-api");

type TracingOptions = {
  attributes?: Attributes;
  recordRequestBody?: boolean;
  recordResponseStatus?: boolean;
};

export function withTracing<T extends RequestHandler>(
  handler: T,
  operationName: string,
  options: TracingOptions = {}
): T {
  if (!ENABLE_TRACING) {
    return handler;
  }

  const wrappedHandler = async (event: RequestEvent) => {
    const spanName = `api.${operationName}`;

    return tracer.startActiveSpan(spanName, async (span: Span) => {
      const startTime = performance.now();

      try {
        span.setAttributes({
          "http.request.method": event.request.method,
          "url.path": event.url.pathname,
          "api.operation": operationName,
          ...options.attributes,
        });

        const response = await handler(event);

        const duration = performance.now() - startTime;

        if (options.recordResponseStatus !== false && response instanceof Response) {
          span.setAttributes({
            "http.response.status_code": response.status,
            "api.duration_ms": duration,
            "event.outcome": response.ok ? "success" : "failure",
          });

          if (!response.ok) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.status}`,
            });
          }
        }

        return response;
      } catch (error) {
        const err = error as Error;
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        span.setAttributes({
          "event.outcome": "failure",
          "error.type": err.name,
          "error.message": err.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  };

  return wrappedHandler as T;
}

export function getActiveSpan(): Span | undefined {
  if (!ENABLE_TRACING) return undefined;
  return trace.getActiveSpan();
}

export function addSpanAttributes(attributes: Attributes): void {
  if (!ENABLE_TRACING) return;

  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

export function recordSpanError(error: Error): void {
  if (!ENABLE_TRACING) return;

  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

export function createChildSpan(name: string, fn: (span: Span) => Promise<void>): Promise<void> {
  if (!ENABLE_TRACING) {
    return fn({} as Span);
  }

  return tracer.startActiveSpan(name, async (span) => {
    try {
      await fn(span);
    } finally {
      span.end();
    }
  });
}
