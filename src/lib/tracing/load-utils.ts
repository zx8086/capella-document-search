// src/lib/tracing/load-utils.ts
// Tracing utilities for SvelteKit load functions (SIO-367)

import type { Attributes } from "@opentelemetry/api";
import type { RequestEvent } from "@sveltejs/kit";

const ENABLE_TRACING =
  (typeof process !== "undefined" && process.env?.ENABLE_OPENTELEMETRY === "true") ||
  (typeof Bun !== "undefined" && Bun.env?.ENABLE_OPENTELEMETRY === "true");

export function annotateLoadSpan(event: RequestEvent, attributes: Attributes): void {
  if (!ENABLE_TRACING) return;

  const span = event.tracing?.current ?? event.tracing?.root;
  if (span) {
    span.setAttributes(attributes);
  }
}

export function recordLoadError(event: RequestEvent, error: Error): void {
  if (!ENABLE_TRACING) return;

  const span = event.tracing?.current ?? event.tracing?.root;
  if (span) {
    span.recordException(error);
    span.setAttributes({
      "event.outcome": "failure",
      "error.type": error.name,
      "error.message": error.message,
    });
  }
}

export function setLoadOutcome(event: RequestEvent, success: boolean): void {
  if (!ENABLE_TRACING) return;

  const span = event.tracing?.current ?? event.tracing?.root;
  if (span) {
    span.setAttributes({
      "event.outcome": success ? "success" : "failure",
    });
  }
}

export function addLoadMetadata(
  event: RequestEvent,
  metadata: {
    dataSource?: string;
    itemCount?: number;
    cached?: boolean;
    duration?: number;
  }
): void {
  if (!ENABLE_TRACING) return;

  const span = event.tracing?.current ?? event.tracing?.root;
  if (span) {
    const attributes: Attributes = {};

    if (metadata.dataSource) {
      attributes["data.source"] = metadata.dataSource;
    }
    if (metadata.itemCount !== undefined) {
      attributes["data.item_count"] = metadata.itemCount;
    }
    if (metadata.cached !== undefined) {
      attributes["cache.hit"] = metadata.cached;
    }
    if (metadata.duration !== undefined) {
      attributes["load.duration_ms"] = metadata.duration;
    }

    span.setAttributes(attributes);
  }
}
