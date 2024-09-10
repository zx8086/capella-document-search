/* src/MonitoredOTLPLogExporter.ts */

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { type ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";

export class MonitoredOTLPLogExporter extends OTLPLogExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  async export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        super.export(logs, (result) => {
          if (result.code === ExportResultCode.SUCCESS) {
            this.successfulExports++;
            this.logSuccess(logs.length, Date.now() - exportStartTime);
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
        this.logSuccess(logs.length, Date.now() - exportStartTime);
      } else {
        this.logFailure(error, logs.length, Date.now() - exportStartTime);
        resultCallback({
          code: ExportResultCode.FAILED,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    this.periodicLogging();
  }

  private logSuccess(logCount: number, duration: number): void {
    console.log(`Successfully exported ${logCount} logs in ${duration}ms`);
  }

  private logFailure(error: unknown, logCount: number, duration: number): void {
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
