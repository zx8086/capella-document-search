/* src/utils/serverLogger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import { backendConfig } from "$backendConfig";

// Define the transports array
const transports: winston.transport[] = [
  new winston.transports.Console(),
  new OpenTelemetryTransportV3({
    level: backendConfig.application.LOG_LEVEL,
  }),
];

// Add file logging if ENABLE_FILE_LOGGING is set to 'true'
if (process.env.ENABLE_FILE_LOGGING === "true") {
  transports.push(
    new DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: backendConfig.application.LOG_MAX_SIZE,
      maxFiles: backendConfig.application.LOG_MAX_FILES,
    }),
  );
}

// Create the logger
const logger = winston.createLogger({
  level: backendConfig.application.LOG_LEVEL,
  format: ecsFormat({
    convertReqRes: true,
    apmIntegration: true,
  }),
  transports: transports,
});

export function log(message: string, meta?: any): void {
  logger.info(message, meta);
}

export function err(message: string, meta?: any): void {
  logger.error(message, meta);
}

export function warn(message: string, meta?: any): void {
  logger.warn(message, meta);
}

export function debug(message: string, meta?: any): void {
  logger.debug(message, meta);
}
