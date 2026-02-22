/* src/otel/logger.ts */

import { context, type SpanContext, trace } from "@opentelemetry/api";
import * as api from "@opentelemetry/api-logs";
import { SeverityNumber } from "@opentelemetry/api-logs";
import type { BackendConfig } from "../models/types";

let logger: api.Logger | null = null;
let config: BackendConfig | null = null;

/**
 * Initialize OpenTelemetry logger with 2025 standards compliance
 */
export function initializeOtelLogger(backendConfig: BackendConfig) {
  // Validate required configuration
  if (!backendConfig?.openTelemetry?.SERVICE_NAME) {
    throw new Error(
      "CRITICAL: OpenTelemetry SERVICE_NAME is required but missing from configuration"
    );
  }
  if (!backendConfig?.openTelemetry?.SERVICE_VERSION) {
    throw new Error(
      "CRITICAL: OpenTelemetry SERVICE_VERSION is required but missing from configuration"
    );
  }
  if (!backendConfig?.openTelemetry?.DEPLOYMENT_ENVIRONMENT) {
    throw new Error(
      "CRITICAL: OpenTelemetry DEPLOYMENT_ENVIRONMENT is required but missing from configuration"
    );
  }

  config = backendConfig;
  logger = api.logs.getLogger(
    config.openTelemetry.SERVICE_NAME,
    config.openTelemetry.SERVICE_VERSION
  );

  console.log("[OTel] Logger initialized with trace correlation");
  console.log(
    `   - Service: ${config.openTelemetry.SERVICE_NAME} v${config.openTelemetry.SERVICE_VERSION}`
  );
  console.log(`   - Environment: ${config.openTelemetry.DEPLOYMENT_ENVIRONMENT}`);
}

/**
 * Get trace context for log correlation (2025 pattern)
 */
function getTraceContext() {
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    return spanContext
      ? {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          traceFlags: spanContext.traceFlags,
        }
      : undefined;
  } catch (_error) {
    // Silently handle OpenTelemetry not ready
    return undefined;
  }
}

// Use unified circuit breaker from telemetry-circuit-breaker.ts (SIO-369)
import { getTelemetryCircuitBreakers } from "./telemetry-circuit-breaker";

function getLogsCircuitBreaker() {
  return getTelemetryCircuitBreakers().logs;
}

/**
 * Enhanced logging function with 2025 compliance and ECS field mapping
 */
export function log(message: string, meta?: any): void {
  if (!config) {
    throw new Error("CRITICAL: Logger not initialized - call initializeOtelLogger() first");
  }

  const cb = getLogsCircuitBreaker();
  if (!cb.canExecute()) {
    console.log(message, meta);
    return;
  }

  const startTime = Date.now();
  try {
    const traceContext = getTraceContext();

    if (logger) {
      logger.emit({
        severityNumber: SeverityNumber.INFO,
        severityText: "INFO",
        body: message,
        attributes: {
          ...meta,
          ...(traceContext && {
            "trace.id": traceContext.traceId,
            "span.id": traceContext.spanId,
            "trace.flags": traceContext.traceFlags,
          }),
          "service.name": config.openTelemetry.SERVICE_NAME,
          "service.version": config.openTelemetry.SERVICE_VERSION,
          "service.environment": config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
          "log.level": "info",
        },
        timestamp: Date.now() * 1_000_000,
      });
      cb.recordSuccess(Date.now() - startTime);
    } else {
      console.log(message, meta);
    }
  } catch (error) {
    cb.recordFailure(error as Error);
    console.log(message, meta);
  }
}

/**
 * Error logging with ECS-compliant error fields
 */
export function err(message: string, meta?: any): void {
  if (!config) {
    throw new Error("CRITICAL: Logger not initialized - call initializeOtelLogger() first");
  }

  const cb = getLogsCircuitBreaker();
  if (!cb.canExecute()) {
    console.error(message, meta);
    return;
  }

  const startTime = Date.now();
  try {
    const traceContext = getTraceContext();

    if (logger) {
      logger.emit({
        severityNumber: SeverityNumber.ERROR,
        severityText: "ERROR",
        body: message,
        attributes: {
          ...meta,
          ...(traceContext && {
            "trace.id": traceContext.traceId,
            "span.id": traceContext.spanId,
            "trace.flags": traceContext.traceFlags,
          }),
          "service.name": config.openTelemetry.SERVICE_NAME,
          "service.version": config.openTelemetry.SERVICE_VERSION,
          "service.environment": config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
          "log.level": "error",
          "event.outcome": "failure",
          "labels.sampling_priority": "high",
        },
        timestamp: Date.now() * 1_000_000,
      });
      cb.recordSuccess(Date.now() - startTime);
    } else {
      console.error(message, meta);
    }
  } catch (error) {
    cb.recordFailure(error as Error);
    console.error(message, meta);
  }
}

/**
 * Warning logging
 */
export function warn(message: string, meta?: any): void {
  if (!config) {
    throw new Error("CRITICAL: Logger not initialized - call initializeOtelLogger() first");
  }

  const cb = getLogsCircuitBreaker();
  if (!cb.canExecute()) {
    console.warn(message, meta);
    return;
  }

  const startTime = Date.now();
  try {
    const traceContext = getTraceContext();

    if (logger) {
      logger.emit({
        severityNumber: SeverityNumber.WARN,
        severityText: "WARN",
        body: message,
        attributes: {
          ...meta,
          ...(traceContext && {
            "trace.id": traceContext.traceId,
            "span.id": traceContext.spanId,
            "trace.flags": traceContext.traceFlags,
          }),
          "service.name": config.openTelemetry.SERVICE_NAME,
          "service.version": config.openTelemetry.SERVICE_VERSION,
          "service.environment": config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
          "log.level": "warn",
        },
        timestamp: Date.now() * 1_000_000,
      });
      cb.recordSuccess(Date.now() - startTime);
    } else {
      console.warn(message, meta);
    }
  } catch (error) {
    cb.recordFailure(error as Error);
    console.warn(message, meta);
  }
}

/**
 * Debug logging with trace context
 */
export function debug(message: string, meta?: any): void {
  if (!config) {
    throw new Error("CRITICAL: Logger not initialized - call initializeOtelLogger() first");
  }

  const cb = getLogsCircuitBreaker();
  if (!cb.canExecute()) {
    console.debug(message, meta);
    return;
  }

  const startTime = Date.now();
  try {
    const traceContext = getTraceContext();

    if (logger) {
      logger.emit({
        severityNumber: SeverityNumber.DEBUG,
        severityText: "DEBUG",
        body: message,
        attributes: {
          ...meta,
          ...(traceContext && {
            "trace.id": traceContext.traceId,
            "span.id": traceContext.spanId,
            "trace.flags": traceContext.traceFlags,
          }),
          "service.name": config.openTelemetry.SERVICE_NAME,
          "service.version": config.openTelemetry.SERVICE_VERSION,
          "service.environment": config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
          "log.level": "debug",
        },
        timestamp: Date.now() * 1_000_000,
      });
      cb.recordSuccess(Date.now() - startTime);
    } else {
      console.debug(message, meta);
    }
  } catch (error) {
    cb.recordFailure(error as Error);
    console.debug(message, meta);
  }
}

/**
 * Bun-optimized retry with backoff for telemetry operations
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Use Bun.sleep() if available for better performance
      const delay = baseDelay * 2 ** (attempt - 1);
      if (typeof Bun !== "undefined") {
        await Bun.sleep(delay);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error("Should never reach here");
}

/**
 * Health check for telemetry pipeline
 */
export function getTelemetryHealth(): {
  logger: boolean;
  circuitBreaker: {
    open: boolean;
    state: string;
  };
} {
  const cb = getLogsCircuitBreaker();
  const status = cb.getStatus();
  return {
    logger: logger !== null,
    circuitBreaker: {
      open: !cb.canExecute(),
      state: status.stateName,
    },
  };
}
