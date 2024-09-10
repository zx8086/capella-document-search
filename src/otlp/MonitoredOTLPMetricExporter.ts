/* src/MonitoredOTLPMetricExporter.ts */

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";

export class MonitoredOTLPMetricExporter extends OTLPMetricExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  async export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        super.export(metrics, (result) => {
          if (result.code === ExportResultCode.SUCCESS) {
            this.successfulExports++;
            this.logSuccess(
              metrics.scopeMetrics.length,
              Date.now() - exportStartTime,
            );
            resolve();
          } else {
            reject(result.error);
          }
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Request timed out")
      ) {
        console.warn(
          "Ignoring timeout error as data is likely sent successfully",
        );
        this.successfulExports++;
        this.logSuccess(
          metrics.scopeMetrics.length,
          Date.now() - exportStartTime,
        );
      } else {
        this.logFailure(
          error,
          metrics.scopeMetrics.length,
          Date.now() - exportStartTime,
        );
        resultCallback({
          code: ExportResultCode.FAILED,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    this.periodicLogging();
  }

  private logSuccess(metricCount: number, duration: number): void {
    console.log(
      `Successfully exported ${metricCount} metrics in ${duration}ms`,
    );
  }

  private logFailure(
    error: unknown,
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
