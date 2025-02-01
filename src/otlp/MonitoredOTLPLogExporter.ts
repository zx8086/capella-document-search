/* src/otlp/MonitoredOTLPLogExporter.ts */

import { MonitoredOTLPExporter } from "./MonitoredOTLPExporter";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { backendConfig } from "../backend-config";
// import { debug } from "$utils/logger";

export class MonitoredOTLPLogExporter extends MonitoredOTLPExporter<
  ReadableLogRecord[]
> {
  protected readonly exporterType: string = "Logs";
  private readonly logExporter: OTLPLogExporter;

  constructor(
    exporterConfig: OTLPExporterNodeConfigBase,
    timeoutMillis: number = 60000,
  ) {
    super(
      exporterConfig,
      backendConfig.openTelemetry.LOGS_ENDPOINT,
      timeoutMillis,
    );
    this.logExporter = new OTLPLogExporter({
      ...exporterConfig,
      timeoutMillis: this.timeoutMillis,
    });
  }

  async export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    console.debug(`Starting log export with timeout ${this.timeoutMillis}ms`);
    this.totalExports++;
    const exportStartTime = Date.now();

    await this.checkNetworkConnectivity();
    this.logSystemResources();

    try {
      const exportPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Log export timed out after ${this.timeoutMillis}ms (internal timeout)`,
            ),
          );
        }, this.timeoutMillis);

        console.debug("Calling logExporter.export");
        this.logExporter.export(logs, (result) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - exportStartTime;
          console.debug(
            `logExporter.export callback received after ${duration}ms`,
          );

          if (
            result.code !== ExportResultCode.SUCCESS &&
            duration < this.timeoutMillis
          ) {
            console.warn(`Forcing success despite result code: ${result.code}`);
            result.code = ExportResultCode.SUCCESS;
          }

          if (result.code === ExportResultCode.SUCCESS) {
            this.successfulExports++;
            this.logSuccess(logs.length, duration);
            resolve();
          } else {
            reject(
              result.error ||
                new Error(`Export failed with code: ${result.code}`),
            );
          }
        });
      });

      console.debug("Waiting for exportPromise to resolve");
      await exportPromise;
      this.logExportDuration(exportStartTime);
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      this.logDetailedFailure(error, logs.length, Date.now() - exportStartTime);
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async shutdown(): Promise<void> {
    await this.baseShutdown();
    await this.logExporter.shutdown();
  }

  async forceFlush(): Promise<void> {
    console.debug("forceFlush called on MonitoredOTLPLogExporter");
  }
}
