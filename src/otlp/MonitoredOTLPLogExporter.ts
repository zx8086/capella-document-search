/* src/otlp/MonitoredOTLPLogExporter.ts */

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import dns from "dns";
import { isIP } from "net";
import os from "os";
import { otlpConfig } from "./otlpConfig";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { backendConfig } from "$backendConfig";

export class MonitoredOTLPLogExporter extends OTLPLogExporter {
  private totalExports: number = 0;
  private successfulExports: number = 0;
  private lastLogTime: number = Date.now();
  private readonly logIntervalMs: number;
  public readonly url: string;

  constructor(exporterConfig: OTLPExporterNodeConfigBase) {
    super(exporterConfig);
    this.url = exporterConfig.url || backendConfig.openTelemetry.LOGS_ENDPOINT;
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

    const processMemory = process.memoryUsage();
    const processCpuUsage = process.cpuUsage();

    console.debug(`System CPU Usage (1m average): ${cpuUsage.toFixed(2)}`);
    console.debug(`System Memory Usage: ${memoryUsage.toFixed(2)}%`);
    console.debug(
      `Total System Memory: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
    console.debug(
      `Free System Memory: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
    console.debug(
      `Process RSS: ${(processMemory.rss / 1024 / 1024).toFixed(2)} MB`,
    );
    console.debug(
      `Process Heap Total: ${(processMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    );
    console.debug(
      `Process Heap Used: ${(processMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    );
    console.debug(
      `Process CPU User: ${(processCpuUsage.user / 1000000).toFixed(2)} seconds`,
    );
    console.debug(
      `Process CPU System: ${(processCpuUsage.system / 1000000).toFixed(2)} seconds`,
    );
  }

  async export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    this.totalExports++;
    const exportStartTime = Date.now();

    await this.checkNetworkConnectivity();
    this.logSystemResources();

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
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      this.logDetailedFailure(error, logs.length, Date.now() - exportStartTime);
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    this.periodicLogging();
  }

  private logSuccess(logCount: number, duration: number): void {
    console.debug(`Successfully exported ${logCount} logs in ${duration}ms`);
  }

  private logDetailedFailure(
    error: unknown,
    logCount: number,
    duration: number,
  ): void {
    console.error(`Failed to export ${logCount} logs after ${duration}ms:`);
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
    const timeSinceLastLog = currentTime - this.lastLogTime;
    console.log(
      `Time since last log: ${timeSinceLastLog}ms, Interval: ${this.logIntervalMs}ms`,
    );

    if (timeSinceLastLog >= this.logIntervalMs) {
      const successRate = (this.successfulExports / this.totalExports) * 100;
      console.debug(`
=== OpenTelemetry Logs Export Statistics ===
Total Exports: ${this.totalExports}
Successful Exports: ${this.successfulExports}
Success Rate: ${successRate.toFixed(2)}%
========================================
      `);
      this.lastLogTime = currentTime;
    }
  }
}
