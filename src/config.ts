/* src/config.ts */

import { getEnvOrThrow, getEnvNumberOrThrow } from "./utils";
import type { Config } from "./models/types";

export const config: Config = {
  application: {
    HEALTH_CHECK_PORT: getEnvNumberOrThrow("HEALTH_CHECK_PORT"),
    HEALTH_CHECK_LOG_INTERVAL: getEnvNumberOrThrow("HEALTH_CHECK_LOG_INTERVAL"),
    HEALTH_CHECK_INTERVAL: getEnvNumberOrThrow("HEALTH_CHECK_INTERVAL"),
    CRON_SCHEDULE: getEnvOrThrow("CRON_SCHEDULE"),
    LOG_LEVEL: getEnvOrThrow("LOG_LEVEL"),
    LOG_MAX_SIZE: getEnvOrThrow("LOG_MAX_SIZE"),
    LOG_MAX_FILES: getEnvOrThrow("LOG_MAX_FILES"),
  },
  capella: {
    API_BASE_URL: getEnvOrThrow("API_BASE_URL"),
    ORG_ID: getEnvOrThrow("ORG_ID"),
    PROJECT_ID: getEnvOrThrow("PROJECT_ID"),
    CLUSTER_ID: getEnvOrThrow("CLUSTER_ID"),
    BUCKET_ID: getEnvOrThrow("BUCKET_ID"),
    AUTH_TOKEN: getEnvOrThrow("AUTH_TOKEN"),
  },
  openTelemetry: {
    SERVICE_NAME: getEnvOrThrow("SERVICE_NAME"),
    SERVICE_VERSION: getEnvOrThrow("SERVICE_VERSION"),
    DEPLOYMENT_ENVIRONMENT: getEnvOrThrow("DEPLOYMENT_ENVIRONMENT"),
    TRACES_ENDPOINT: getEnvOrThrow("TRACES_ENDPOINT"),
    METRICS_ENDPOINT: getEnvOrThrow("METRICS_ENDPOINT"),
    LOGS_ENDPOINT: getEnvOrThrow("LOGS_ENDPOINT"),
    METRIC_READER_INTERVAL: getEnvNumberOrThrow("METRIC_READER_INTERVAL"),
    CONSOLE_METRIC_READER_INTERVAL: getEnvNumberOrThrow(
      "CONSOLE_METRIC_READER_INTERVAL",
    ),
  },
  messaging: {
    ALERT_TYPE: getEnvOrThrow("ALERT_TYPE"),
    SLACK_WEBHOOK_URL: getEnvOrThrow("SLACK_WEBHOOK_URL"),
    TEAMS_WEBHOOK_URL: getEnvOrThrow("TEAMS_WEBHOOK_URL"),
  },
};

export * from "./models/types";
export default config;
