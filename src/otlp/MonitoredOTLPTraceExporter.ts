/* src/otlp/MonitoredOTLPTraceExporter.ts */

import { MonitoredOTLPExporter } from "./MonitoredOTLPExporter";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { backendConfig } from "$backendConfig";
// import { debug } from "$utils/logger";

export class MonitoredOTLPTraceExporter extends MonitoredOTLPExporter<
  ReadableSpan[]
> {
  protected readonly exporterType: string = "Traces";
  private readonly traceExporter: OTLPTraceExporter;

  constructor(
    exporterConfig: OTLPExporterNodeConfigBase,
    timeoutMillis: number = 60000,
  ) {
    super(
      exporterConfig,
      backendConfig.openTelemetry.TRACES_ENDPOINT,
      timeoutMillis,
    );
    this.traceExporter = new OTLPTraceExporter({
      ...exporterConfig,
      timeoutMillis: this.timeoutMillis,
    });
  }

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    console.debug(`Starting trace export with timeout ${this.timeoutMillis}ms`);
    this.totalExports++;
    const exportStartTime = Date.now();

    await this.checkNetworkConnectivity();
    this.logSystemResources();

    try {
      const exportPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Trace export timed out after ${this.timeoutMillis}ms (internal timeout)`,
            ),
          );
        }, this.timeoutMillis);

        console.debug("Calling traceExporter.export");
        this.traceExporter.export(spans, (result) => {
          clearTimeout(timeoutId);
          const duration = Date.now() - exportStartTime;
          console.debug(
            `traceExporter.export callback received after ${duration}ms`,
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
            this.logSuccess(spans.length, duration);
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
      this.logDetailedFailure(
        error,
        spans.length,
        Date.now() - exportStartTime,
      );
      resultCallback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async shutdown(): Promise<void> {
    await this.baseShutdown();
    await this.traceExporter.shutdown();
  }

  async forceFlush(): Promise<void> {
    await this.traceExporter.forceFlush();
  }
}
