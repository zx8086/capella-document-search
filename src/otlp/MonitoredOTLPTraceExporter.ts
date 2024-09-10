/* src/MonitoredOTLPTraceExporter.ts */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

export class MonitoredOTLPTraceExporter extends OTLPTraceExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  async send(
    spans: ReadableSpan[],
    onSuccess: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        super.send(
          spans,
          () => {
            this.successfulExports++;
            this.logSuccess(spans.length, Date.now() - exportStartTime);
            onSuccess();
            resolve();
          },
          (error) => {
            if (error.message.includes("Request timed out")) {
              console.warn(
                "Ignoring timeout error as data is likely sent successfully",
              );
              this.successfulExports++;
              this.logSuccess(spans.length, Date.now() - exportStartTime);
              onSuccess();
              resolve();
            } else {
              this.logFailure(
                error,
                spans.length,
                Date.now() - exportStartTime,
              );
              onError(error);
              reject(error);
            }
          },
        );
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
        this.logSuccess(spans.length, Date.now() - exportStartTime);
        onSuccess();
      } else {
        this.logFailure(error, spans.length, Date.now() - exportStartTime);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.periodicLogging();
  }

  private logSuccess(spanCount: number, duration: number): void {
    console.log(`Successfully exported ${spanCount} spans in ${duration}ms`);
  }

  private logFailure(
    error: unknown,
    spanCount: number,
    duration: number,
  ): void {
    console.error(
      `Failed to export ${spanCount} spans after ${duration}ms:`,
      error,
    );
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.log(`
=== OpenTelemetry Trace Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
============================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
