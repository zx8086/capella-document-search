/* src/otlp/MonitoredOTLPExporter.ts */

import { promises as dnsPromises } from "node:dns";
import { isIP } from "node:net";
import { loadavg, totalmem, freemem, hostname } from "node:os";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import type { ExportResult } from "@opentelemetry/core";
import { backendConfig } from "../backend-config";
import { log, warn, err, debug } from "../utils/browserLogger";
import { otlpConfig } from "./otlpConfig";
import { safeDnsPrefetch, getDnsCacheStats } from "../lib/utils/dnsUtils";
import { getDnsPrefetchTargets } from "../lib/config/dnsConfig";

// Import Bun DNS with type checking
let bunDns: any;
try {
  bunDns = require("bun").dns;
} catch {
  bunDns = {
    getCacheStats: () => ({
      size: 0,
      cacheHitsCompleted: 0,
      cacheMisses: 0,
      totalCount: 0,
      cacheHitsInflight: 0,
    }),
    prefetch: () => {},
  };
}

export abstract class MonitoredOTLPExporter<T> {
  private logTimer: any;
  private readonly hostName: string;
  private readonly port: number;
  private dnsPrefetchInitiated: boolean = false;
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

    const url = new URL(this.url);
    this.hostName = url.hostname;
    this.port = url.port
      ? parseInt(url.port)
      : url.protocol === "https:"
        ? 443
        : 80;

    this.initializeDNSPrefetch();

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
      this.logIntervalMs = backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL; // Using your original config
    } else {
      debug(`${this.constructor.name} log interval: ${this.logIntervalMs}ms`);
    }

    this.logTimer = setInterval(() => {
      this.logStatistics();
    }, this.logIntervalMs);

    this.startHealthChecks();
  }

  private async verifyDNSPrefetch(): Promise<void> {
    try {
      const beforeStats = bunDns.getCacheStats();
      const addresses = await dnsPromises.resolve4(this.hostName, {
        ttl: true,
      });
      const afterStats = bunDns.getCacheStats();

      const cacheEffective =
        afterStats.cacheHitsCompleted > beforeStats.cacheHitsCompleted;

      debug(`DNS prefetch verification:
        Host: ${this.hostName}
        Addresses: ${addresses.map((addr) => (typeof addr === "string" ? addr : addr.address)).join(", ")}
        Cache effective: ${cacheEffective}
        TTL configured: ${process.env["BUN_CONFIG_DNS_TIME_TO_LIVE_SECONDS"] || "30"} seconds
      `);
    } catch (error) {
      err("DNS prefetch verification failed:", error);
    }
  }

  private async initializeDNSPrefetch(): Promise<void> {
    try {
      const initialStats = getDnsCacheStats();
      if (initialStats) {
        debug("Initial DNS cache stats:", initialStats);
      }

      // Add the current hostname to monitoring targets
      const targets = [...getDnsPrefetchTargets(['monitoring']), this.hostName];
      await safeDnsPrefetch(targets);
      
      this.dnsPrefetchInitiated = true;
      debug(`DNS prefetch initiated for ${targets.join(', ')}`);

      await this.verifyDNSPrefetch();
    } catch (error) {
      err("DNS prefetch initialization failed:", error);
    }
  }

  private logStatistics(): void {
    const machineName = hostname();
    const successRate = (this.successfulExports / this.totalExports) * 100 || 0;
    const dnsStats = bunDns.getCacheStats();

    log(
      `[Host: ${machineName}] OpenTelemetry ${this.exporterType} Export Statistics:
      Total Exports: ${this.totalExports}
      Successful Exports: ${this.successfulExports}
      Success Rate: ${successRate.toFixed(2)}%
      DNS Cache Hits: ${dnsStats.cacheHitsCompleted}
      DNS Cache Size: ${dnsStats.size}`,
    );
  }

  protected async checkNetworkConnectivity(): Promise<void> {
    if (!this.dnsPrefetchInitiated) {
      debug("DNS prefetch not initiated, doing it now...");
      await this.initializeDNSPrefetch();
    }

    if (!isIP(this.hostName)) {
      try {
        const beforeStats = bunDns.getCacheStats();
        debug(`DNS cache stats before resolve:`, beforeStats);

        const addresses = await dnsPromises.resolve4(this.hostName, {
          ttl: true,
        });
        debug(
          `DNS resolution for ${this.hostName}: ${addresses
            .map((addr) =>
              typeof addr === "string"
                ? addr
                : `${addr.address} (TTL: ${addr.ttl})`,
            )
            .join(", ")}`,
        );

        const afterStats = bunDns.getCacheStats();
        debug(`DNS cache stats after resolve:`, afterStats);
      } catch (error) {
        err(`DNS resolution failed for ${this.hostName}:`, error);
      }
    }
  }

  protected logSystemResources(): void {
    const cpuUsage = loadavg()[0];
    const totalMemory = totalmem();
    const freeMemory = freemem();
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
    const dnsStats = bunDns.getCacheStats();
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
    err(`DNS Cache Status at failure:
      Size: ${dnsStats.size}
      Hits: ${dnsStats.cacheHitsCompleted}
      Misses: ${dnsStats.cacheMisses}
    `);
    err(`Current time: ${new Date().toISOString()}`);
  }

  protected async baseShutdown(): Promise<void> {
    const finalDnsStats = bunDns.getCacheStats();
    debug("Final DNS Cache Stats:", finalDnsStats);

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

  protected async validateEndpoint(): Promise<void> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Accept': 'application/x-protobuf'
        }
      });
      
      const acceptableStatuses = [200, 204, 400, 415];
      if (!acceptableStatuses.includes(response.status)) {
        warn(`OpenTelemetry endpoint ${this.url} returned unexpected status ${response.status}`);
      }
    } catch (error) {
      err(`Failed to validate OpenTelemetry endpoint ${this.url}:`, error);
    }
  }

  private startHealthChecks(): void {
    setInterval(() => {
      this.validateEndpoint();
      this.checkNetworkConnectivity();
      this.logSystemResources();
    }, this.logIntervalMs);
  }
}
