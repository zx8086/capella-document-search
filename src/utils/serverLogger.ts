/* src/utils/serverLogger.ts */

import { ecsFormat } from "@elastic/ecs-winston-format";
import { context, type SpanContext, trace } from "@opentelemetry/api";
import winston from "winston";
import TransportStream from "winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import type { BackendConfig } from "../models/types";

let loggerInstance: winston.Logger | null = null;

function getLogger(config: BackendConfig): winston.Logger {
  if (loggerInstance) return loggerInstance;

  class OpenTelemetryHttpTransport extends TransportStream {
    constructor(options: any) {
      super(options);
    }

    override async log(info: any, callback: () => void) {
      if (config?.openTelemetry && process.env.ENABLE_OPENTELEMETRY === 'true') {
        try {
          const logData = {
            resourceLogs: [
              {
                resource: {
                  attributes: [
                    {
                      key: "service.name",
                      value: {
                        stringValue: config.openTelemetry.SERVICE_NAME || "capella-document-search",
                      },
                    },
                  ],
                },
                scopeLogs: [
                  {
                    scope: {
                      name: "capella-document-search",
                    },
                    logRecords: [
                      {
                        timeUnixNano: Date.now() * 1000000,
                        severityNumber: this.getSeverityNumber(info.level || info["log.level"] || "info"),
                        severityText: (info.level || info["log.level"] || "info").toUpperCase(),
                        body: {
                          stringValue: info.message,
                        },
                        attributes: [
                          {
                            key: "log.level",
                            value: { stringValue: info.level || info["log.level"] || "info" },
                          },
                          {
                            key: "timestamp",
                            value: { stringValue: info["@timestamp"] },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          };

          const response = await fetch(
            config.openTelemetry.LOGS_ENDPOINT || "http://localhost:4318/v1/logs",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(logData),
            },
          );

          if (!response.ok) {
            console.debug(
              `OpenTelemetry HTTP error: ${response.status} ${response.statusText}`,
            );
          }
        } catch (error) {
          console.debug(
            `Failed to send log to OpenTelemetry (endpoint: ${config.openTelemetry?.LOGS_ENDPOINT || "http://localhost:4318/v1/logs"}):`,
            error,
          );
        }
      }
      callback();
    }

    private getSeverityNumber(level: string): number {
      switch (level.toLowerCase()) {
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

  const customFormat = winston.format.combine(
    ecsFormat({ convertReqRes: true, apmIntegration: true }),
    winston.format((info) => {
      const traceObj = info["trace"] as
        | { id?: string; span?: { id?: string } }
        | undefined;
      if (traceObj) {
        info.trace = {
          id: traceObj.id || "",
          span: { id: traceObj.span?.id || "" },
        };
      }
      return info;
    })(),
  );

  const dailyRotateFile = new DailyRotateFile({
    filename: "logs/application-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: config.application.LOG_MAX_SIZE,
    maxFiles: config.application.LOG_MAX_FILES,
    handleExceptions: true,
  });
  
  dailyRotateFile.setMaxListeners(20);

  const transports: TransportStream[] = [];

  if (config?.application?.LOG_LEVEL) {
    transports.push(
      new winston.transports.Console({
        level: config.application.LOG_LEVEL,
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
        handleExceptions: true,
        handleRejections: true,
      }),
    );
  }

  if (process.env.ENABLE_OPENTELEMETRY === 'true') {
    try {
      const otelLevel = config?.application?.LOG_LEVEL || "info";
      const otelTransport = new OpenTelemetryHttpTransport({
        level: otelLevel,
      });
      transports.push(otelTransport);
    } catch (error) {
      console.error("Failed to create OpenTelemetry transport:", error);
    }
  }

  transports.push(dailyRotateFile);

  loggerInstance = winston.createLogger({
    level: config.application.LOG_LEVEL,
    format: customFormat,
    transports,
    exitOnError: false,
  });

  return loggerInstance;
}

export function initializeLogger(config: BackendConfig) {
  loggerInstance = getLogger(config);
}

export function log(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    ...(meta && { meta }),
    ...(spanContext && {
      trace: {
        id: spanContext.traceId,
        span: { id: spanContext.spanId },
      },
    }),
  };

  if (loggerInstance) {
    loggerInstance.info(logData);
  } else {
    console.log(message, meta);
  }
}

export function err(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    ...(meta && { meta }),
    ...(spanContext && {
      trace: {
        id: spanContext.traceId,
        span: { id: spanContext.spanId },
      },
    }),
  };

  if (loggerInstance) {
    loggerInstance.error(logData);
  } else {
    console.error(message, meta);
  }
}

export function warn(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    ...(meta && { meta }),
    ...(spanContext && {
      trace: {
        id: spanContext.traceId,
        span: { id: spanContext.spanId },
      },
    }),
  };

  if (loggerInstance) {
    loggerInstance.warn(logData);
  } else {
    console.warn(message, meta);
  }
}

export function debug(message: string, meta?: any): void {
  const ctx = context.active();
  const span = trace.getSpan(ctx);
  const spanContext: SpanContext | undefined = span?.spanContext();

  const logData = {
    message,
    ...(meta && { meta }),
    ...(spanContext && {
      trace: {
        id: spanContext.traceId,
        span: { id: spanContext.spanId },
      },
    }),
  };

  if (loggerInstance) {
    loggerInstance.debug(logData);
  } else {
    console.debug(message, meta);
  }
}
