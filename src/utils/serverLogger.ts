/* src/utils/serverLogger.ts */

import winston from "winston";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import { ecsFormat } from "@elastic/ecs-winston-format";
import type { BackendConfig } from "../models/types";

function createLogger(config: BackendConfig) {
  const dailyRotateFile = new DailyRotateFile({
    filename: "logs/application-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: config.application.LOG_MAX_SIZE,
    maxFiles: config.application.LOG_MAX_FILES,
    handleExceptions: true,
  });
  
  // Set max listeners to prevent memory leak warnings
  dailyRotateFile.setMaxListeners(20);
  
  return winston.createLogger({
    level: config.application.LOG_LEVEL,
    format: ecsFormat({
      convertReqRes: true,
      apmIntegration: true,
    }),
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      }),
      new OpenTelemetryTransportV3({
        level: config.application.LOG_LEVEL,
      }),
      dailyRotateFile,
    ],
    exitOnError: false,
  });
}

let logger: winston.Logger;

export function initializeLogger(config: BackendConfig) {
  logger = createLogger(config);
}

export function log(message: string, meta?: any): void {
  if (logger) {
    logger.info(message, meta);
  } else {
    console.log(message, meta);
  }
}

export function err(message: string, meta?: any): void {
  if (logger) {
    logger.error(message, meta);
  } else {
    console.error(message, meta);
  }
}

export function warn(message: string, meta?: any): void {
  if (logger) {
    logger.warn(message, meta);
  } else {
    console.warn(message, meta);
  }
}

export function debug(message: string, meta?: any): void {
  if (logger) {
    logger.debug(message, meta);
  } else {
    console.debug(message, meta);
  }
}
