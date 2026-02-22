// src/otel/metrics.ts

import { metrics } from "@opentelemetry/api";
import type { BackendConfig } from "../models/types";

let httpRequestCounter: any;
let httpResponseTimeHistogram: any;
let couchbaseConnectionCounter: any;
let ragOperationHistogram: any;
let chatRequestCounter: any;
// Telemetry self-metrics (SIO-370)
let telemetryExportsCounter: any;
let telemetryExportErrorsCounter: any;
let telemetryExportDurationHistogram: any;
let telemetryCardinalityGauge: any;

/**
 * Initialize application metrics following 2025 UCUM standards
 */
export function initializeMetrics(config: BackendConfig) {
  const meter = metrics.getMeter(
    config.openTelemetry.SERVICE_NAME,
    config.openTelemetry.SERVICE_VERSION
  );

  // HTTP request counter
  httpRequestCounter = meter.createCounter("http_requests_total", {
    description: "Total number of HTTP requests",
    unit: "1", // Dimensionless count
  });

  // HTTP response time histogram (2025: use seconds, not milliseconds)
  httpResponseTimeHistogram = meter.createHistogram("http_response_time_seconds", {
    description: "HTTP response time in seconds",
    unit: "s", // UCUM standard unit for time
    boundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10], // Buckets in seconds
  });

  // Couchbase connection counter
  couchbaseConnectionCounter = meter.createCounter("couchbase_connections_total", {
    description: "Total Couchbase connection attempts",
    unit: "1",
  });

  // RAG operation duration histogram
  ragOperationHistogram = meter.createHistogram("rag_operation_duration_seconds", {
    description: "RAG operation duration in seconds",
    unit: "s",
    boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60], // RAG operations can take longer
  });

  // Chat request counter
  chatRequestCounter = meter.createCounter("chat_requests_total", {
    description: "Total chat requests processed",
    unit: "1",
  });

  // Telemetry self-metrics (SIO-370)
  telemetryExportsCounter = meter.createCounter("telemetry_exports_total", {
    description: "Total telemetry export attempts by signal type",
    unit: "1",
  });

  telemetryExportErrorsCounter = meter.createCounter("telemetry_export_errors_total", {
    description: "Total telemetry export errors by signal type",
    unit: "1",
  });

  telemetryExportDurationHistogram = meter.createHistogram("telemetry_export_duration_seconds", {
    description: "Telemetry export duration in seconds",
    unit: "s",
    boundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

  telemetryCardinalityGauge = meter.createObservableGauge("telemetry_cardinality_usage", {
    description: "Current cardinality usage percentage",
    unit: "1",
  });

  console.log("[OTel] Metrics initialized with 2025 UCUM standards");
}

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(method: string, route: string, status: number) {
  httpRequestCounter?.add(1, {
    method,
    route,
    status_code: status.toString(),
  });
}

/**
 * Record HTTP response time (convert milliseconds to seconds for 2025 standard)
 */
export function recordHttpResponseTime(duration: number, method: string, route: string) {
  const durationSeconds = duration / 1000; // Convert ms to seconds
  httpResponseTimeHistogram?.record(durationSeconds, {
    method,
    route,
  });
}

/**
 * Record Couchbase connection attempt
 */
export function recordCouchbaseConnection(success: boolean, operation: string) {
  couchbaseConnectionCounter?.add(1, {
    success: success.toString(),
    operation,
  });
}

/**
 * Record RAG operation duration
 */
export function recordRagOperation(duration: number, provider: string, operation: string) {
  const durationSeconds = duration / 1000; // Convert ms to seconds
  ragOperationHistogram?.record(durationSeconds, {
    provider,
    operation,
  });
}

/**
 * Record chat request
 */
export function recordChatRequest(model: string, success: boolean) {
  chatRequestCounter?.add(1, {
    model,
    success: success.toString(),
  });
}

/**
 * Record telemetry export attempt (SIO-370)
 */
export function recordTelemetryExport(
  signal: "traces" | "metrics" | "logs",
  success: boolean,
  durationMs: number
) {
  telemetryExportsCounter?.add(1, {
    signal,
    success: success.toString(),
  });

  if (!success) {
    telemetryExportErrorsCounter?.add(1, { signal });
  }

  const durationSeconds = durationMs / 1000;
  telemetryExportDurationHistogram?.record(durationSeconds, { signal });
}

/**
 * Update cardinality gauge (SIO-370)
 */
export function updateCardinalityMetric(usagePercent: number, warningLevel: string) {
  telemetryCardinalityGauge?.addCallback((result: any) => {
    result.observe(usagePercent / 100, { warning_level: warningLevel });
  });
}

/**
 * Bun-optimized performance timing helper
 */
export function measureOperation<T>(
  _name: string,
  operation: () => T,
  recordFn: (duration: number, ...args: any[]) => void,
  ...recordArgs: any[]
): T {
  const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;

  try {
    const result = operation();
    const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;
    const duration = (end - start) / 1_000_000; // Convert to milliseconds

    recordFn(duration, ...recordArgs);
    return result;
  } catch (error) {
    const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;
    const duration = (end - start) / 1_000_000;

    recordFn(duration, ...recordArgs);
    throw error;
  }
}

/**
 * Async version of measureOperation
 */
export async function measureOperationAsync<T>(
  _name: string,
  operation: () => Promise<T>,
  recordFn: (duration: number, ...args: any[]) => void,
  ...recordArgs: any[]
): Promise<T> {
  const start = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;

  try {
    const result = await operation();
    const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;
    const duration = (end - start) / 1_000_000;

    recordFn(duration, ...recordArgs);
    return result;
  } catch (error) {
    const end = typeof Bun !== "undefined" ? Bun.nanoseconds() : Date.now() * 1_000_000;
    const duration = (end - start) / 1_000_000;

    recordFn(duration, ...recordArgs);
    throw error;
  }
}
