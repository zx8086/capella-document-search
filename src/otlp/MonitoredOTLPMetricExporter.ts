/* src/otlp/MonitoredOTLPMetricExporter.ts */

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import dns from "dns";
import { isIP } from "net";
import os from "os";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { backendConfig } from "$backendConfig";
import { otlpConfig } from "./otlpConfig";

export class MonitoredOTLPMetricExporter extends OTLPMetricExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number;
  public readonly url: string;

  constructor(exporterConfig: OTLPExporterNodeConfigBase) {
    super(exporterConfig);
    this.url =
      exporterConfig.url || backendConfig.openTelemetry.METRICS_ENDPOINT;
    console.log(`${this.constructor.name} initialized with URL: ${this.url}`);

    this.logIntervalMs = otlpConfig.logIntervalMs;
    if (typeof this.logIntervalMs !== "number" || isNaN(this.logIntervalMs)) {
      console.warn(
        `Invalid logIntervalMs: ${this.logIntervalMs}. Using default of 300000ms.`,
      );
      this.logIntervalMs = backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL;
    } else {
      console.log(
        `${this.constructor.name} log interval: ${this.logIntervalMs}ms`,
      );
    }
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
    console.debug("Starting metric export");
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
  }

  private periodicLogging(): void {
    const currentTime = Date.now();
    const timeSinceLastLog = currentTime - this.lastLogTime;
    console.log(
      `Time since last log: ${timeSinceLastLog}ms, Interval: ${this.logIntervalMs}ms`,
    );

    if (timeSinceLastLog >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.debug(`
=== OpenTelemetry Metrics Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
========================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
