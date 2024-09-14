/* src/backend-config.ts */

import * as env from "./env/static/private";
import type { BackendConfig } from "./models/types";

export const backendConfig: BackendConfig = {
  application: {
    LOG_LEVEL: env.LOG_LEVEL,
    LOG_MAX_SIZE: env.LOG_MAX_SIZE,
    LOG_MAX_FILES: env.LOG_MAX_FILES,
    GRAPHQL_ENDPOINT: env.GRAPHQL_ENDPOINT,
    DB_DATA_DIR: env.DB_DATA_DIR,
    ENABLE_FILE_LOGGING: env.ENABLE_FILE_LOGGING === "true",
  },
  capella: {
    API_BASE_URL: env.API_BASE_URL,
    ORG_ID: env.ORG_ID,
    PROJECT_ID: env.PROJECT_ID,
    CLUSTER_ID: env.CLUSTER_ID,
    BUCKET_ID: env.BUCKET_ID,
    AUTH_TOKEN: env.AUTH_TOKEN,
  },
  openTelemetry: {
    SERVICE_NAME: env.SERVICE_NAME,
    SERVICE_VERSION: env.SERVICE_VERSION,
    DEPLOYMENT_ENVIRONMENT: env.DEPLOYMENT_ENVIRONMENT,
    TRACES_ENDPOINT: env.TRACES_ENDPOINT,
    METRICS_ENDPOINT: env.METRICS_ENDPOINT,
    LOGS_ENDPOINT: env.LOGS_ENDPOINT,
    METRIC_READER_INTERVAL: Number(env.METRIC_READER_INTERVAL),
  },
} as const;

export type { BackendConfig } from "./models/types";
