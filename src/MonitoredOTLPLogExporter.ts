// src/MonitoredOTLPLogExporter.ts

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { type ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";

export class MonitoredOTLPLogExporter extends OTLPLogExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.totalExports++;
    const exportStartTime = Date.now();

    super.export(logs, (result) => {
      if (result.code === ExportResultCode.SUCCESS) {
        this.successfulExports++;
        this.logSuccess(logs.length, Date.now() - exportStartTime);
      } else {
        this.logFailure(
          result.error,
          logs.length,
          Date.now() - exportStartTime,
        );
      }
      resultCallback(result);
      this.periodicLogging();
    });
  }

  private logSuccess(logCount: number, duration: number): void {
    console.log(`Successfully exported ${logCount} logs in ${duration}ms`);
  }

  private logFailure(
    error: Error | undefined,
    logCount: number,
    duration: number,
  ): void {
    console.error(
      `Failed to export ${logCount} logs after ${duration}ms:`,
      error,
    );
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.log(`
=== OpenTelemetry Log Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
============================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
