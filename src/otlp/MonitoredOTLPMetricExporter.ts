/* src/MonitoredOTLPMetricExporter.ts */

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import dns from "dns";
import { isIP } from "net";
import os from "os";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";

export class MonitoredOTLPMetricExporter extends OTLPMetricExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number = 60000; // Log every minute
  private readonly url: string;

  constructor(config: OTLPExporterNodeConfigBase) {
    super(config);
    this.url = config.url || "http://localhost:4318/v1/metrics";
  }

  private async checkNetworkConnectivity(): Promise<void> {
    const url = new URL(this.url);
    const host = url.hostname;

    console.debug(`Checking network connectivity to ${host}`);

    if (!isIP(host)) {
      try {
        const addresses = await dns.promises.resolve4(host);
        console.debug(`DNS resolution for ${host}: ${addresses.join(", ")}`);
      } catch (error) {
        console.error(`DNS resolution failed for ${host}:`, error);
      }
    }
  }

  private logSystemResources(): void {
    const cpuUsage = os.loadavg()[0];
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    console.debug(`CPU Usage (1m average): ${cpuUsage.toFixed(2)}`);
    console.debug(`Memory Usage: ${memoryUsage.toFixed(2)}%`);
    console.debug(
      `Total Memory: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
    console.debug(
      `Free Memory: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
  }

  async export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    await this.checkNetworkConnectivity();
    this.logSystemResources();

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
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      this.logDetailedFailure(
        error,
        metrics.scopeMetrics.length,
        Date.now() - exportStartTime,
      );
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    this.periodicLogging();
  }

  private logSuccess(metricCount: number, duration: number): void {
    console.debug(
      `Successfully exported ${metricCount} metrics in ${duration}ms`,
    );
  }

  private logDetailedFailure(
    error: unknown,
    metricCount: number,
    duration: number,
  ): void {
    console.error(
      `Failed to export ${metricCount} metrics after ${duration}ms:`,
    );
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}`);
      console.error(`Error message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    } else {
      console.error(`Unexpected error type:`, error);
    }
    console.error(
      `Current memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    );
    console.error(`Current time: ${new Date().toISOString()}`);
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    if (currentTime - this.lastLogTime >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.debug(`
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
