/* src/frontend-config.ts */

import { envSchema } from "./env/schema";
import type { FrontendConfig } from "./models/types";

const env = import.meta.env;

export const frontendConfig: FrontendConfig = {
  openreplay: {
    PROJECT_KEY: env[envSchema.openreplay.projectKey],
    INGEST_POINT: env[envSchema.openreplay.ingestPoint],
  },
  csv: {
    FILE_UPLOAD_LIMIT: Number(env[envSchema.csv.uploadLimit]),
  },
  elasticApm: {
    SERVICE_NAME: env[envSchema.elastic.serviceName],
    SERVER_URL: env[envSchema.elastic.serverUrl],
    SERVICE_VERSION: env[envSchema.elastic.serviceVersion],
    ENVIRONMENT: env[envSchema.elastic.environment],
  },
} as const;

// Debug log to verify values are loaded correctly
console.log("Frontend Config:", frontendConfig);

export type { FrontendConfig } from "./models/types";
