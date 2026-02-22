/* src/otel/ecs-mapping.ts */

/**
 * Elastic Common Schema (ECS) field mappings for OpenTelemetry
 * Version: ECS 8.0.0 compatible
 *
 * This module provides utilities to convert OpenTelemetry attributes
 * to ECS-compliant field names for better integration with Elastic Stack.
 */

/**
 * ECS-compliant field mapping for HTTP operations
 */
export function mapHttpAttributesToECS(attributes: Record<string, any>): Record<string, any> {
  const ecsAttributes: Record<string, any> = {};

  // Map HTTP fields to ECS format
  if (attributes["http.method"]) {
    ecsAttributes["http.request.method"] = attributes["http.method"];
  }
  if (attributes["http.status_code"]) {
    ecsAttributes["http.response.status_code"] = attributes["http.status_code"];
  }
  if (attributes["http.route"]) {
    ecsAttributes["url.path"] = attributes["http.route"];
  }
  if (attributes["http.url"]) {
    ecsAttributes["url.full"] = attributes["http.url"];
  }
  if (attributes["user_agent.original"]) {
    ecsAttributes["user_agent.original"] = attributes["user_agent.original"];
  }

  // Event categorization based on status
  const statusCode = attributes["http.status_code"] || attributes["http.response.status_code"];
  if (statusCode >= 400) {
    ecsAttributes["event.outcome"] = "failure";
    ecsAttributes["event.category"] = ["web"];
    ecsAttributes["event.type"] = ["error"];
  } else {
    ecsAttributes["event.outcome"] = "success";
    ecsAttributes["event.category"] = ["web"];
    ecsAttributes["event.type"] = ["access"];
  }

  return ecsAttributes;
}

/**
 * ECS-compliant field mapping for database operations
 */
export function mapDatabaseAttributesToECS(attributes: Record<string, any>): Record<string, any> {
  const ecsAttributes: Record<string, any> = {};

  // Map database fields
  if (attributes["db.system"]) {
    ecsAttributes["service.target.type"] = attributes["db.system"];
  }
  if (attributes["db.operation"] || attributes["db.statement"]) {
    ecsAttributes["event.action"] = attributes["db.operation"] || "query";
  }
  if (attributes["db.collection.name"]) {
    ecsAttributes["service.target.resource"] = attributes["db.collection.name"];
  }
  if (attributes["db.name"]) {
    ecsAttributes["service.target.name"] = attributes["db.name"];
  }

  // Standard database event categorization
  ecsAttributes["event.category"] = ["database"];
  ecsAttributes["event.type"] = ["access"];

  return ecsAttributes;
}

/**
 * ECS-compliant error field mapping
 */
export function mapErrorAttributesToECS(error: Error): Record<string, any> {
  return {
    "error.type": error.name,
    "error.message": error.message,
    "error.stack_trace": error.stack,
    "event.outcome": "failure",
  };
}

/**
 * ECS-compliant service field mapping
 */
export function mapServiceAttributesToECS(serviceInfo: {
  name: string;
  version?: string;
  environment?: string;
  type?: string;
}): Record<string, any> {
  const ecsAttributes: Record<string, any> = {
    "service.name": serviceInfo.name,
    "service.type": serviceInfo.type || "application",
    "service.environment": serviceInfo.environment || process.env.NODE_ENV || "development",
  };

  if (serviceInfo.version) {
    ecsAttributes["service.version"] = serviceInfo.version;
  }

  return ecsAttributes;
}

/**
 * ECS-compliant trace correlation fields
 */
export function mapTraceAttributesToECS(traceContext: {
  traceId: string;
  spanId: string;
  traceFlags?: number;
}): Record<string, any> {
  return {
    "trace.id": traceContext.traceId,
    "span.id": traceContext.spanId,
    ...(traceContext.traceFlags !== undefined && {
      "trace.flags": traceContext.traceFlags,
    }),
  };
}

/**
 * ECS-compliant log level mapping
 */
export function mapLogLevelToECS(level: string): Record<string, any> {
  const ecsLevel = level.toLowerCase();

  return {
    "log.level": ecsLevel,
    "event.dataset": "capella-document-search.application",
    "event.module": "otel-logger",
    "ecs.version": "8.0.0",
  };
}

/**
 * ECS-compliant performance metric mapping
 */
export function mapPerformanceAttributesToECS(metrics: {
  duration?: number;
  operation?: string;
  outcome?: "success" | "failure";
}): Record<string, any> {
  const ecsAttributes: Record<string, any> = {};

  if (metrics.duration !== undefined) {
    // Duration in microseconds (ECS standard)
    ecsAttributes["event.duration"] = Math.round(metrics.duration * 1000);
  }

  if (metrics.operation) {
    ecsAttributes["event.action"] = metrics.operation;
  }

  if (metrics.outcome) {
    ecsAttributes["event.outcome"] = metrics.outcome;
  }

  // Performance events
  ecsAttributes["event.category"] = ["process"];
  ecsAttributes["event.type"] = ["info"];

  return ecsAttributes;
}

/**
 * Comprehensive ECS attribute mapper
 * Automatically detects attribute types and applies appropriate ECS mappings
 */
export function mapToECS(
  attributes: Record<string, any>,
  context?: {
    error?: Error;
    service?: { name: string; version?: string; type?: string };
    trace?: { traceId: string; spanId: string; traceFlags?: number };
  }
): Record<string, any> {
  let ecsAttributes: Record<string, any> = { ...attributes };

  // Apply HTTP mapping if HTTP attributes detected
  if (attributes["http.method"] || attributes["http.status_code"]) {
    ecsAttributes = { ...ecsAttributes, ...mapHttpAttributesToECS(attributes) };
  }

  // Apply database mapping if DB attributes detected
  if (attributes["db.system"] || attributes["db.operation"]) {
    ecsAttributes = { ...ecsAttributes, ...mapDatabaseAttributesToECS(attributes) };
  }

  // Apply error mapping if error context provided
  if (context?.error) {
    ecsAttributes = { ...ecsAttributes, ...mapErrorAttributesToECS(context.error) };
  }

  // Apply service mapping if service context provided
  if (context?.service) {
    ecsAttributes = { ...ecsAttributes, ...mapServiceAttributesToECS(context.service) };
  }

  // Apply trace mapping if trace context provided
  if (context?.trace) {
    ecsAttributes = { ...ecsAttributes, ...mapTraceAttributesToECS(context.trace) };
  }

  // Add timestamp in ECS format
  ecsAttributes["@timestamp"] = new Date().toISOString();

  return ecsAttributes;
}

/**
 * ECS field validation
 * Ensures all required ECS fields are present and properly formatted
 */
export function validateECSFields(attributes: Record<string, any>): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required timestamp
  if (!attributes["@timestamp"]) {
    errors.push("Missing required field: @timestamp");
  }

  // Check service identification
  if (!attributes["service.name"]) {
    errors.push("Missing required field: service.name");
  }

  // Validate event outcome values
  if (
    attributes["event.outcome"] &&
    !["success", "failure", "unknown"].includes(attributes["event.outcome"])
  ) {
    warnings.push(`Invalid event.outcome value: ${attributes["event.outcome"]}`);
  }

  // Validate log level
  if (
    attributes["log.level"] &&
    !["debug", "info", "warn", "error", "fatal"].includes(attributes["log.level"])
  ) {
    warnings.push(`Invalid log.level value: ${attributes["log.level"]}`);
  }

  // Check ECS version
  if (!attributes["ecs.version"]) {
    warnings.push("Missing recommended field: ecs.version");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Debug utility to show ECS mapping transformations
 */
export function debugECSMapping(
  originalAttributes: Record<string, any>,
  ecsAttributes: Record<string, any>
): void {
  if (process.env.NODE_ENV === "development") {
    console.debug("[ECS Mapping] Debug:", {
      original: originalAttributes,
      ecsCompliant: ecsAttributes,
      transformations: Object.keys(ecsAttributes).filter(
        (key) => !Object.hasOwn(originalAttributes, key)
      ),
    });
  }
}
