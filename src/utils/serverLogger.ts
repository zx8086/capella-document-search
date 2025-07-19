/* src/utils/serverLogger.ts */

import { ecsFormat } from "@elastic/ecs-winston-format";
import { context, type SpanContext, trace } from "@opentelemetry/api";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import type { BackendConfig } from "../models/types";

let loggerInstance: winston.Logger | null = null;

// Helper function to extract OpenTelemetry trace context
function getTraceContext() {
  try {
    const ctx = context.active();
    const span = trace.getSpan(ctx);
    const spanContext: SpanContext | undefined = span?.spanContext();

    return spanContext
      ? {
          trace: { id: spanContext.traceId },
          span: { id: spanContext.spanId },
        }
      : {};
  } catch (error) {
    // Silently ignore if OpenTelemetry context is not ready
    return {};
  }
}

// Generic logging function
function logWithLevel(level: 'info' | 'error' | 'warn' | 'debug', message: string, meta?: any): void {
  const traceData = getTraceContext();
  const mergedMeta = { ...meta, ...traceData };

  if (loggerInstance) {
    loggerInstance[level](message, mergedMeta);
  } else {
    // Fallback to console with appropriate method
    const consoleMethods = {
      info: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug
    };
    consoleMethods[level](message, meta);
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
  logWithLevel('info', message, meta);
}

export function err(message: string, meta?: any): void {
  logWithLevel('error', message, meta);
}

export function warn(message: string, meta?: any): void {
  logWithLevel('warn', message, meta);
}

export function debug(message: string, meta?: any): void {
  logWithLevel('debug', message, meta);
}
