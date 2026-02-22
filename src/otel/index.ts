/* src/otel/index.ts */

/**
 * OpenTelemetry Integration for Capella Document Search
 * 2025 Standards Compliant Implementation
 *
 * This module provides a unified interface for all OpenTelemetry functionality
 * optimized for Bun runtime with 2025 best practices.
 */

export * from "./ecs-mapping";
export * from "./logger";
export * from "./metrics";
export * from "./propagation";
export * from "./sampling";
export * from "./types";
export * from "./telemetry-circuit-breaker";
export * from "./export-stats-tracker";
export * from "./cardinality-guard";
export * from "./wrapped-exporters";
export * from "./lifecycle";

import { trace } from "@opentelemetry/api";
import { debug, err, getTelemetryHealth, log, warn } from "./logger";
import {
  measureOperationAsync,
  recordChatRequest,
  recordCouchbaseConnection,
  recordHttpRequest,
  recordHttpResponseTime,
  recordRagOperation,
} from "./metrics";
import { injectTraceContext, setupRequestTracing } from "./propagation";

/**
 * High-level API for common telemetry operations
 */
export class TelemetryService {
  private tracer = trace.getTracer("capella-document-search");

  /**
   * Trace an HTTP operation with automatic metrics collection
   */
  async traceHttpOperation<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
      method: string;
      route: string;
      expectedStatus?: number;
    }
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now();
      let status = options.expectedStatus || 200;

      try {
        const result = await operation();

        span.setAttributes({
          // ECS-compliant HTTP fields
          "http.request.method": options.method,
          "url.path": options.route,
          "http.response.status_code": status,
          // ECS event outcome
          "event.outcome": "success",
          "event.category": ["web"],
          "event.type": ["access"],
        });

        return result;
      } catch (error) {
        status = 500;
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        span.setAttributes({
          // ECS-compliant HTTP fields
          "http.request.method": options.method,
          "url.path": options.route,
          "http.response.status_code": status,
          // ECS event outcome and error fields
          "event.outcome": "failure",
          "event.category": ["web"],
          "event.type": ["error"],
          "error.type": (error as Error).name,
          "error.message": (error as Error).message,
        });

        err(`HTTP operation failed: ${name}`, {
          error: (error as Error).message,
          method: options.method,
          route: options.route,
        });

        throw error;
      } finally {
        const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : performance.now();
        const duration =
          typeof Bun !== "undefined"
            ? (end - start) / 1_000_000
            : // Convert nanoseconds to milliseconds
              end - start;

        span.end();

        // Record metrics
        recordHttpRequest(options.method, options.route, status);
        recordHttpResponseTime(duration, options.method, options.route);
      }
    });
  }

  /**
   * Trace a database operation
   */
  async traceDatabaseOperation<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
      operation_type: string;
      collection?: string;
    }
  ): Promise<T> {
    return this.tracer.startActiveSpan(`db.${name}`, async (span) => {
      span.setAttributes({
        // ECS-compliant database fields
        "service.target.type": "couchbase",
        "event.action": options.operation_type,
        "event.category": ["database"],
        "event.type": ["access"],
        ...(options.collection && { "service.target.resource": options.collection }),
      });

      try {
        const result = await operation();
        recordCouchbaseConnection(true, options.operation_type);
        span.setAttributes({ "event.outcome": "success" });
        return result;
      } catch (error) {
        recordCouchbaseConnection(false, options.operation_type);
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        span.setAttributes({
          "event.outcome": "failure",
          "error.type": (error as Error).name,
          "error.message": (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace a RAG operation
   */
  async traceRagOperation<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
      provider: string;
      operation_type: string;
    }
  ): Promise<T> {
    return measureOperationAsync(
      name,
      () =>
        this.tracer.startActiveSpan(`rag.${name}`, async (span) => {
          span.setAttributes({
            // ECS-compliant service and event fields
            "service.target.name": options.provider,
            "service.target.type": "rag-provider",
            "event.action": options.operation_type,
            "event.category": ["process"],
            "event.type": ["info"],
          });

          try {
            const result = await operation();
            span.setAttributes({ "event.outcome": "success" });
            return result;
          } catch (error) {
            span.recordException(error as Error);
            span.setStatus({ code: 2, message: (error as Error).message });
            span.setAttributes({
              "event.outcome": "failure",
              "error.type": (error as Error).name,
              "error.message": (error as Error).message,
            });
            throw error;
          } finally {
            span.end();
          }
        }),
      recordRagOperation,
      options.provider,
      options.operation_type
    );
  }

  /**
   * Trace a chat operation with model tracking
   */
  async traceChatOperation<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
      model: string;
      provider?: string;
    }
  ): Promise<T> {
    return this.tracer.startActiveSpan(`chat.${name}`, async (span) => {
      span.setAttributes({
        // ECS-compliant LLM fields
        "service.target.name": options.model,
        "service.target.type": "llm",
        "event.category": ["process"],
        "event.type": ["info"],
        ...(options.provider && { "service.target.resource": options.provider }),
      });

      try {
        const result = await operation();
        recordChatRequest(options.model, true);
        span.setAttributes({ "event.outcome": "success" });
        return result;
      } catch (error) {
        recordChatRequest(options.model, false);
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        span.setAttributes({
          "event.outcome": "failure",
          "error.type": (error as Error).name,
          "error.message": (error as Error).message,
        });

        err(`Chat operation failed: ${name}`, {
          model: options.model,
          provider: options.provider,
          error: (error as Error).message,
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get comprehensive telemetry status
   */
  getStatus() {
    return {
      ...getTelemetryHealth(),
      runtime: typeof Bun !== "undefined" ? "bun" : "node",
      version: typeof Bun !== "undefined" ? Bun.version : process.version,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const telemetry = new TelemetryService();

// ECS mapping utilities
import {
  mapDatabaseAttributesToECS,
  mapErrorAttributesToECS,
  mapHttpAttributesToECS,
  mapToECS,
  validateECSFields,
} from "./ecs-mapping";

// Export individual functions for convenience
export {
  log,
  err,
  warn,
  debug,
  setupRequestTracing,
  injectTraceContext,
  recordHttpRequest,
  recordHttpResponseTime,
  recordCouchbaseConnection,
  recordRagOperation,
  recordChatRequest,
  // ECS mapping utilities
  mapToECS,
  mapHttpAttributesToECS,
  mapDatabaseAttributesToECS,
  mapErrorAttributesToECS,
  validateECSFields,
};

/**
 * Middleware factory for SvelteKit request tracing
 */
export function createTelemetryMiddleware() {
  return {
    traceRequest: setupRequestTracing,
    injectHeaders: injectTraceContext,
  };
}
