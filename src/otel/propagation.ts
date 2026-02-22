/* src/otel/propagation.ts */

import { propagation } from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";

/**
 * Configure W3C TraceContext propagation for 2025 standards compliance
 * Ensures proper trace context propagation across service boundaries
 */
export function configurePropagation(): void {
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  propagation.setGlobalPropagator(propagator);

  console.log("[OpenTelemetry] W3C TraceContext propagation configured");
  console.log("   - W3C Trace Context: enabled");
  console.log("   - W3C Baggage: enabled");
}

/**
 * Extract trace context for manual correlation
 * Useful for logging and debugging
 */
export function extractTraceContext(headers: Record<string, string>): {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
} {
  try {
    const propagator = propagation.getActivePropagator();
    const context = propagator.extract({}, headers, {
      get: (carrier, key) => carrier[key],
      keys: (carrier) => Object.keys(carrier),
    });

    // Extract trace context if available
    const span = context ? context["span"] : undefined;
    if (span?.spanContext) {
      const spanContext = span.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
      };
    }

    return {};
  } catch (error) {
    console.warn("Failed to extract trace context:", error);
    return {};
  }
}

/**
 * Inject trace context into outgoing requests
 * For use with fetch, axios, or other HTTP clients
 */
export function injectTraceContext(headers: Record<string, string> = {}): Record<string, string> {
  try {
    const propagator = propagation.getActivePropagator();
    const context = propagation.active();

    const injectedHeaders = { ...headers };
    propagator.inject(context, injectedHeaders, {
      set: (carrier, key, value) => {
        carrier[key] = value;
      },
    });

    return injectedHeaders;
  } catch (error) {
    console.warn("Failed to inject trace context:", error);
    return headers;
  }
}

/**
 * SvelteKit-specific helper for request tracing
 * Use in +server.ts files and API routes
 */
export function setupRequestTracing(request: Request) {
  const headers: Record<string, string> = {};

  // Convert Headers to plain object
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    traceContext: extractTraceContext(headers),
    injectHeaders: (outgoingHeaders: Record<string, string> = {}) =>
      injectTraceContext({ ...outgoingHeaders, ...headers }),
  };
}
