/* src/backend-config.ts */

import type { BackendConfig } from "./models/types";
import {
  getEnvOrThrow,
  getEnvNumberOrThrow,
  getEnvBooleanOrThrow,
} from "./checkEnvVars";
import { initializeLogger } from "./utils/serverLogger";

export function initializeBackendConfig(): BackendConfig {
  const config: BackendConfig = {
    application: {
      LOG_LEVEL: getEnvOrThrow("LOG_LEVEL"),
      LOG_MAX_SIZE: getEnvOrThrow("LOG_MAX_SIZE"),
      LOG_MAX_FILES: getEnvOrThrow("LOG_MAX_FILES"),
      GRAPHQL_ENDPOINT: getEnvOrThrow("GRAPHQL_ENDPOINT"),
      DB_DATA_DIR: getEnvOrThrow("DB_DATA_DIR"),
      ENABLE_FILE_LOGGING: getEnvBooleanOrThrow("ENABLE_FILE_LOGGING"),
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
      SUMMARY_LOG_INTERVAL: getEnvNumberOrThrow("SUMMARY_LOG_INTERVAL"),
    },
  };

  initializeLogger(config);

  return config;
}

export const backendConfig = initializeBackendConfig();

export type { BackendConfig } from "./models/types";
