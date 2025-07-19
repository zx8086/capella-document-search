/* src/utils/serverLogger.ts */

import { ecsFormat } from "@elastic/ecs-winston-format";
import { context, type SpanContext, trace } from "@opentelemetry/api";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import TransportStream from "winston-transport";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import type { BackendConfig } from "../models/types";

let loggerInstance: winston.Logger | null = null;

// Custom OpenTelemetry transport for Winston (unused - kept for reference)
// The actual transport used is OpenTelemetryTransportV3 from @opentelemetry/winston-transport
class OpenTelemetryTransport extends TransportStream {
  private endpoint: string;

  constructor(options: { level?: string; endpoint: string }) {
    super(options);
    this.endpoint = options.endpoint;
  }

  override async log(info: any, callback: () => void) {
    try {
      const logData = {
        resourceLogs: [
          {
            resource: {
              attributes: [
                {
                  key: "service.name",
                  value: { stringValue: "capella-document-search" },
                },
              ],
            },
            scopeLogs: [
              {
                scope: { name: "winston" },
                logRecords: [
                  {
                    timeUnixNano: Date.now() * 1000000,
                    severityNumber: this.getSeverityNumber(info.level),
                    severityText: info.level.toUpperCase(),
                    body: { stringValue: info.message },
                    attributes: Object.entries(info).map(([key, value]) => ({
                      key,
                      value: {
                        stringValue:
                          typeof value === "string"
                            ? value
                            : JSON.stringify(value),
                      },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      };

      await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });
    } catch (error) {
      // Silently fail to avoid log loops
    }
    callback();
  }

  private getSeverityNumber(level: string): number {
    switch (level) {
      case "error":
        return 17;
      case "warn":
        return 13;
      case "info":
        return 9;
      case "debug":
        return 5;
      default:
        return 9;
    }
  }
}

function getLogger(config: BackendConfig): winston.Logger {
  if (loggerInstance) return loggerInstance;

  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: config.application.LOG_LEVEL || "info",
      format: winston.format.combine(ecsFormat()),
    }),
  ];

  if (config.application.ENABLE_FILE_LOGGING) {
    transports.push(
      new DailyRotateFile({
        filename: "logs/application-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: config.application.LOG_MAX_SIZE,
        maxFiles: config.application.LOG_MAX_FILES,
        format: ecsFormat(),
      }),
    );
  }

  if (
    config.openTelemetry?.LOGS_ENDPOINT &&
    process.env.ENABLE_OPENTELEMETRY === "true"
  ) {
    transports.push(
      new OpenTelemetryTransportV3({
        level: config.application.LOG_LEVEL || "info",
      }),
    );
  }

  loggerInstance = winston.createLogger({
    level: config.application.LOG_LEVEL || "info",
    transports,
    exitOnError: false,
  });

  return loggerInstance;
}

export function initializeLogger(config: BackendConfig) {
  loggerInstance = getLogger(config);
}

export function log(message: string, meta?: any): void {
  let traceData = {};
  
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    traceData = spanContext
      ? {
          trace: { id: spanContext.traceId },
          span: { id: spanContext.spanId },
        }
      : {};
  } catch (error) {
    // Silently ignore if OpenTelemetry context is not ready
  }

  const mergedMeta = { ...meta, ...traceData };

  if (loggerInstance) {
    loggerInstance.info(message, mergedMeta);
  } else {
    console.log(message, meta);
  }
}

export function err(message: string, meta?: any): void {
  let traceData = {};
  
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    traceData = spanContext
      ? {
          trace: { id: spanContext.traceId },
          span: { id: spanContext.spanId },
        }
      : {};
  } catch (error) {
    // Silently ignore if OpenTelemetry context is not ready
  }

  const mergedMeta = { ...meta, ...traceData };

  if (loggerInstance) {
    loggerInstance.error(message, mergedMeta);
  } else {
    console.error(message, meta);
  }
}

export function warn(message: string, meta?: any): void {
  let traceData = {};
  
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    traceData = spanContext
      ? {
          trace: { id: spanContext.traceId },
          span: { id: spanContext.spanId },
        }
      : {};
  } catch (error) {
    // Silently ignore if OpenTelemetry context is not ready
  }

  const mergedMeta = { ...meta, ...traceData };

  if (loggerInstance) {
    loggerInstance.warn(message, mergedMeta);
  } else {
    console.warn(message, meta);
  }
}

export function debug(message: string, meta?: any): void {
  let traceData = {};
  
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    traceData = spanContext
      ? {
          trace: { id: spanContext.traceId },
          span: { id: spanContext.spanId },
        }
      : {};
  } catch (error) {
    // Silently ignore if OpenTelemetry context is not ready
  }

  const mergedMeta = { ...meta, ...traceData };

  if (loggerInstance) {
    loggerInstance.debug(message, mergedMeta);
  } else {
    console.debug(message, meta);
  }
}
