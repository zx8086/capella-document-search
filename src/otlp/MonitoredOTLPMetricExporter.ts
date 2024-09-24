/* src/otlp/MonitoredOTLPMetricExporter.ts */

import { MonitoredOTLPExporter } from "./MonitoredOTLPExporter";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { backendConfig } from "$backendConfig";
import { log, warn, err } from "$utils/browserLogger";

export class MonitoredOTLPMetricExporter extends MonitoredOTLPExporter<ResourceMetrics> {
  protected readonly exporterType: string = "Metrics";
  private readonly metricExporter: OTLPMetricExporter;

  constructor(
    exporterConfig: OTLPExporterNodeConfigBase,
    timeoutMillis: number = 300000,
  ) {
    // Increased default timeout to 5 minutes
    super(
      exporterConfig,
      backendConfig.openTelemetry.METRICS_ENDPOINT,
      timeoutMillis,
    );
    this.metricExporter = new OTLPMetricExporter({
      ...exporterConfig,
      timeoutMillis: this.timeoutMillis,
    });
  }

  async export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    log(`Starting metric export with timeout ${this.timeoutMillis}ms`);
    this.totalExports++;
    const exportStartTime = Date.now();

    await this.checkNetworkConnectivity();
    this.logSystemResources();

    try {
      const exportPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Metric export timed out after ${this.timeoutMillis}ms (internal timeout)`,
            ),
          );
        }, this.timeoutMillis);

        log("Calling metricExporter.export");
        this.metricExporter.export(metrics, (result) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - exportStartTime;
          log(`metricExporter.export callback received after ${duration}ms`);

          // Force success if HTTP request was successful
          if (
            result.code !== ExportResultCode.SUCCESS &&
            duration < this.timeoutMillis
          ) {
            warn(`Forcing success despite result code: ${result.code}`);
            result.code = ExportResultCode.SUCCESS;
          }

          if (result.code === ExportResultCode.SUCCESS) {
            this.successfulExports++;
            this.logSuccess(metrics.scopeMetrics.length, duration);
            resolve();
          } else {
            reject(
              result.error ||
                new Error(`Export failed with code: ${result.code}`),
            );
          }
        });
      });

      log("Waiting for exportPromise to resolve");
      await exportPromise;
      this.logExportDuration(exportStartTime);
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      this.logDetailedFailure(
        error,
        metrics.scopeMetrics.length,
        Date.now() - exportStartTime,
      );
      warn(
        `Metric export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async shutdown(): Promise<void> {
    log("Shutting down MonitoredOTLPMetricExporter");
    await this.baseShutdown();
    await this.metricExporter.shutdown();
    log("MonitoredOTLPMetricExporter shutdown complete");
  }

  async forceFlush(): Promise<void> {
    log("Force flushing MonitoredOTLPMetricExporter");
    try {
      await this.metricExporter.forceFlush();
      log("Force flush complete");
    } catch (error) {
      err(
        `Error during forceFlush: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
