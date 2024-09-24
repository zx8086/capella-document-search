/* src/otlp/MonitoredOTLPExporter.ts */

import dns from "dns";
import { isIP } from "net";
import os from "os";
import { otlpConfig } from "./otlpConfig";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import type { ExportResult } from "@opentelemetry/core";
import { backendConfig } from "$backendConfig";
import { log, warn, err, debug } from "$utils/browserLogger";

export abstract class MonitoredOTLPExporter<T> {
  private logTimer: any;
  protected totalExports: number = 0;
  protected successfulExports: number = 0;
  protected readonly logIntervalMs: number;
  public readonly url: string;
  protected abstract readonly exporterType: string;
  protected readonly timeoutMillis: number;

  constructor(
    exporterConfig: OTLPExporterNodeConfigBase,
    endpoint: string,
    timeoutMillis: number = 60000,
  ) {
    this.url = exporterConfig.url || endpoint;
    this.timeoutMillis = timeoutMillis;
    debug(
      `${this.constructor.name} initialized with URL: ${this.url} and timeout: ${this.timeoutMillis}ms`,
    );

    this.logIntervalMs = otlpConfig.logIntervalMs;
    if (
      typeof this.logIntervalMs !== "number" ||
      Number.isNaN(this.logIntervalMs)
    ) {
      warn(
        `Invalid logIntervalMs: ${this.logIntervalMs}. Using default of 300000ms.`,
      );
      this.logIntervalMs = backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL;
    } else {
      debug(`${this.constructor.name} log interval: ${this.logIntervalMs}ms`);
    }

    this.logTimer = setInterval(() => {
      this.logStatistics();
    }, this.logIntervalMs);
  }

  private logStatistics(): void {
    const successRate = (this.successfulExports / this.totalExports) * 100 || 0;
    log(
      `OpenTelemetry ${this.exporterType} Export Statistics: Total Exports: ${this.totalExports}, Successful Exports: ${this.successfulExports}, Success Rate: ${successRate.toFixed(2)}%`,
    );
  }

  protected async checkNetworkConnectivity(): Promise<void> {
    const url = new URL(this.url);
    const host = url.hostname;

    debug(`Checking network connectivity to ${host}`);

    if (!isIP(host)) {
      try {
        const addresses = await dns.promises.resolve4(host);
        debug(`DNS resolution for ${host}: ${addresses.join(", ")}`);
      } catch (error) {
        err(`DNS resolution failed for ${host}:`, error);
      }
    }
  }

  protected logSystemResources(): void {
    const cpuUsage = os.loadavg()[0];
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    const processMemory = process.memoryUsage();
    const processCpuUsage = process.cpuUsage();

    debug(`System CPU Usage (1m average): ${cpuUsage.toFixed(2)}`);
    debug(`System Memory Usage: ${memoryUsage.toFixed(2)}%`);
    debug(
      `Total System Memory: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
    debug(
      `Free System Memory: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
    debug(`Process RSS: ${(processMemory.rss / 1024 / 1024).toFixed(2)} MB`);
    debug(
      `Process Heap Total: ${(processMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    );
    debug(
      `Process Heap Used: ${(processMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    );
    debug(
      `Process CPU User: ${(processCpuUsage.user / 1000000).toFixed(2)} seconds`,
    );
    debug(
      `Process CPU System: ${(processCpuUsage.system / 1000000).toFixed(2)} seconds`,
    );
  }

  protected logSuccess(itemCount: number, duration: number): void {
    const itemType = this.getItemType(itemCount);
    log(`Successfully exported ${itemCount} ${itemType} in ${duration}ms`);
  }

  private getItemType(count: number): string {
    const singularType = this.exporterType.toLowerCase().slice(0, -1);
    return count === 1 ? singularType : this.exporterType.toLowerCase();
  }

  protected logDetailedFailure(
    error: unknown,
    itemCount: number,
    duration: number,
  ): void {
    err(`Failed to export ${itemCount} items after ${duration}ms:`);
    if (error instanceof Error) {
      err(`Error name: ${error.name}`);
      err(`Error message: ${error.message}`);
      err(`Stack trace: ${error.stack}`);
    } else {
      err(`Unexpected error type:`, error);
    }
    err(
      `Current memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    );
    err(`Current time: ${new Date().toISOString()}`);
  }

  protected async baseShutdown(): Promise<void> {
    clearInterval(this.logTimer as NodeJS.Timeout);
  }

  protected logExportDuration(startTime: number): void {
    const duration = Date.now() - startTime;
    log(`${this.exporterType} export took ${duration}ms`);
  }

  abstract shutdown(): Promise<void>;

  abstract forceFlush(): Promise<void>;

  abstract export(
    items: T,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void>;
}
