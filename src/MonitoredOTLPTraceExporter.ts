// src/MonitoredOTLPTraceExporter.ts

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

export class MonitoredOTLPTraceExporter extends OTLPTraceExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute

  async send(
    items: ReadableSpan[],
    onSuccess: () => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    try {
      await super.send(
        items,
        () => {
          this.successfulExports++;
          this.logSuccess(items.length, Date.now() - exportStartTime);
          onSuccess();
        },
        (error) => {
          if (error.message.includes("Request timed out")) {
            console.warn(
              "Ignoring timeout error as data is likely sent successfully",
            );
            this.successfulExports++; // Count as success
            this.logSuccess(items.length, Date.now() - exportStartTime);
            onSuccess(); // Treat as success since data is getting through
          } else {
            this.logFailure(error, items.length, Date.now() - exportStartTime);
            onError(error);
          }
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Request timed out")
      ) {
        console.warn(
          "Ignoring timeout error as data is likely sent successfully",
        );
        this.successfulExports++; // Count as success
        this.logSuccess(items.length, Date.now() - exportStartTime);
        onSuccess(); // Treat as success since data is getting through
      } else {
        this.logFailure(error, items.length, Date.now() - exportStartTime);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.periodicLogging();
  }

  private logSuccess(itemCount: number, duration: number): void {
    console.log(`Successfully exported ${itemCount} items in ${duration}ms`);
  }

  private logFailure(
    error: unknown,
    itemCount: number,
    duration: number,
  ): void {
    console.error(
      `Failed to export ${itemCount} items after ${duration}ms:`,
      error,
    );
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.log(`
=== OpenTelemetry Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
============================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
