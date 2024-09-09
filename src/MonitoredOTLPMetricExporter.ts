// src/MonitoredOTLPMetricExporter.ts

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";

export class MonitoredOTLPMetricExporter extends OTLPMetricExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.totalExports++;
    const exportStartTime = Date.now();

    super.export(metrics, (result) => {
      if (result.code === ExportResultCode.SUCCESS) {
        this.successfulExports++;
        this.logSuccess(
          metrics.scopeMetrics.length,
          Date.now() - exportStartTime,
        );
      } else {
        this.logFailure(
          result.error,
          metrics.scopeMetrics.length,
          Date.now() - exportStartTime,
        );
      }
      resultCallback(result);
      this.periodicLogging();
    });
  }

  private logSuccess(metricCount: number, duration: number): void {
    console.log(
      `Successfully exported ${metricCount} metrics in ${duration}ms`,
    );
  }

  private logFailure(
    error: Error | undefined,
    metricCount: number,
    duration: number,
  ): void {
    console.error(
      `Failed to export ${metricCount} metrics after ${duration}ms:`,
      error,
    );
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.log(`
=== OpenTelemetry Metric Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
============================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
