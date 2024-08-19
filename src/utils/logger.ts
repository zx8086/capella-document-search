/* src/utils/logger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import { config } from "./../config";

let DailyRotateFile;
let path;
let __dirname;

async function setupNodeSpecificModules() {
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    const { default: DailyRotateFileModule } = await import(
      "winston-daily-rotate-file"
    );
    DailyRotateFile = DailyRotateFileModule;

    const { default: pathModule } = await import("path");
    path = pathModule;

    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);

    return true;
  }
  return false;
}

export const logger = winston.createLogger({
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

setupNodeSpecificModules().then((isNode) => {
  if (isNode) {
    const rootDir = path.join(__dirname, "..", "..");
    const logsDir = path.join(rootDir, "logs");
    logger.add(
      new DailyRotateFile({
        filename: path.join(logsDir, "application-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: config.application.LOG_MAX_SIZE,
        maxFiles: config.application.LOG_MAX_FILES,
      }),
    );
  }
});

export function log(message: string, meta?: any): void {
  logger.info(message, meta);
}

export function error(message: string, meta?: any): void {
  logger.error(message, meta);
}

export function warn(message: string, meta?: any): void {
  logger.warn(message, meta);
}

export function debug(message: string, meta?: any): void {
  logger.debug(message, meta);
}
