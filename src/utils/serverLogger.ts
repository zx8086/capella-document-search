/* src/utils/serverLogger.ts */

import winston from "winston";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import { ecsFormat } from "@elastic/ecs-winston-format";
import type { BackendConfig } from "../models/types";

function createLogger(config: BackendConfig) {
  return winston.createLogger({
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
}

let logger: winston.Logger;

export function initializeLogger(config: BackendConfig) {
  logger = createLogger(config);
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
