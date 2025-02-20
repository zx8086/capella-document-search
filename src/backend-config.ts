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
      URL: getEnvOrThrow("COUCHBASE_URL"),
      USERNAME: getEnvOrThrow("COUCHBASE_USERNAME"),
      PASSWORD: getEnvOrThrow("COUCHBASE_PASSWORD"),
      BUCKET: getEnvOrThrow("COUCHBASE_BUCKET"),
      SCOPE: getEnvOrThrow("COUCHBASE_SCOPE"),
      COLLECTION: getEnvOrThrow("COUCHBASE_COLLECTION"),
      VECTOR_INDEX: getEnvOrThrow("COUCHBASE_VECTOR_INDEX"),
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
    rag: {
      RAG_PIPELINE: getEnvOrThrow("RAG_PIPELINE"),
      HUGGINGFACE_API_TOKEN: getEnvOrThrow("HUGGINGFACE_API_TOKEN"),
      OPENAI_API_KEY: getEnvOrThrow("OPENAI_API_KEY"),
      PINECONE_API_KEY: getEnvOrThrow("PINECONE_API_KEY"),
      PINECONE_INDEX_NAME: getEnvOrThrow("PINECONE_INDEX_NAME"),
      PINECONE_NAMESPACE: getEnvOrThrow("PINECONE_NAMESPACE"),
    },
  };

  initializeLogger(config);

  return config;
}

export const backendConfig = initializeBackendConfig();

export type { BackendConfig } from "./models/types";
