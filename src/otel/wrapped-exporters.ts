// src/otel/wrapped-exporters.ts
// Wrapped exporters with circuit breaker and stats integration (SIO-365)

import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import { getExportStatsTracker } from "./export-stats-tracker";
import { getTelemetryCircuitBreakers } from "./telemetry-circuit-breaker";
import type { TelemetrySignalType } from "./types";

type ExporterCallback = (result: ExportResult) => void;

function wrapExport<T>(
  signal: TelemetrySignalType,
  items: T[],
  exportFn: (items: T[], callback: ExporterCallback) => void,
  callback: ExporterCallback
): void {
  const circuitBreaker = getTelemetryCircuitBreakers()[signal];
  const statsTracker = getExportStatsTracker();

  if (!circuitBreaker.canExecute()) {
    callback({ code: ExportResultCode.FAILED });
    return;
  }

  const startTime = Date.now();

  exportFn(items, (result: ExportResult) => {
    const durationMs = Date.now() - startTime;
    const success = result.code === ExportResultCode.SUCCESS;

    statsTracker.recordExport(signal, {
      timestamp: Date.now(),
      success,
      error: result.error?.message,
      durationMs,
      itemCount: items.length,
    });

    if (success) {
      circuitBreaker.recordSuccess(durationMs);
    } else {
      circuitBreaker.recordFailure(result.error || new Error("Export failed"));
    }

    callback(result);
  });
}

// Use 'any' types for exporter wrappers due to OpenTelemetry version mismatches
// The wrapper delegates all calls to the underlying exporter which handles the actual types

export class WrappedSpanExporter {
  constructor(private readonly delegate: any) {}

  export(spans: any[], callback: ExporterCallback): void {
    wrapExport("traces", spans, this.delegate.export.bind(this.delegate), callback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

export class WrappedMetricExporter {
  constructor(private readonly delegate: any) {}

  export(metrics: any, callback: ExporterCallback): void {
    const itemCount = metrics.scopeMetrics?.reduce(
      (sum: number, scope: any) => sum + (scope.metrics?.length || 0),
      0
    ) || 0;

    wrapExport(
      "metrics",
      [metrics],
      (items, cb) => this.delegate.export(items[0], cb),
      callback
    );
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  selectAggregationTemporality(instrumentType: any): any {
    return this.delegate.selectAggregationTemporality?.(instrumentType) ?? 1;
  }

  selectAggregation(instrumentType: any): any {
    return this.delegate.selectAggregation?.(instrumentType);
  }
}

export class WrappedLogExporter {
  constructor(private readonly delegate: any) {}

  export(logs: any[], callback: ExporterCallback): void {
    wrapExport("logs", logs, this.delegate.export.bind(this.delegate), callback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

export function createWrappedSpanExporter(delegate: any): WrappedSpanExporter {
  return new WrappedSpanExporter(delegate);
}

export function createWrappedMetricExporter(delegate: any): WrappedMetricExporter {
  return new WrappedMetricExporter(delegate);
}

export function createWrappedLogExporter(delegate: any): WrappedLogExporter {
  return new WrappedLogExporter(delegate);
}
