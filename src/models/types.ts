/* src/models/types.ts */

export interface ApplicationConfig {
  ENABLE_FILE_LOGGING: boolean;
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  GRAPHQL_ENDPOINT: string;
  DB_DATA_DIR: string;
}

export interface CapellaConfig {
  API_BASE_URL: string;
  ORG_ID: string;
  PROJECT_ID: string;
  CLUSTER_ID: string;
  BUCKET_ID: string;
  AUTH_TOKEN: string;
}

export interface OpenTelemetryConfig {
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
  METRIC_READER_INTERVAL: number;
}

export interface OpenReplayConfig {
  VITE_OPENREPLAY_PROJECT_KEY: string;
  VITE_OPENREPLAY_INGEST_POINT: string;
}

export interface CSVConfig {
  VITE_FILE_UPLOAD_LIMIT: number;
}

export interface BackendConfig {
  application: ApplicationConfig;
  capella: CapellaConfig;
  openTelemetry: OpenTelemetryConfig;
}

export interface ElasticApmConfig {
  VITE_ELASTIC_APM_SERVICE_NAME: string;
  VITE_ELASTIC_APM_SERVER_URL: string;
  VITE_ELASTIC_APM_SERVICE_VERSION: string;
  VITE_ELASTIC_APM_ENVIRONMENT: string;
  VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS: string;
}

export interface FrontendConfig {
  openreplay: OpenReplayConfig;
  csv: CSVConfig;
  elasticApm: ElasticApmConfig;
}
