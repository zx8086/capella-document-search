/* src/utils/serverLogger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import { config } from "./../config";

const logger = winston.createLogger({
  level: config.application.LOG_LEVEL,
  format: ecsFormat({
    convertReqRes: true,
    apmIntegration: true,
  }),
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3({
      level: config.application.LOG_LEVEL,
    }),
  ],
});

if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
  logger.add(
    new DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: config.application.LOG_MAX_SIZE,
      maxFiles: config.application.LOG_MAX_FILES,
    }),
  );
}

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
