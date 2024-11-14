/* src/models/types.ts */

export interface ApplicationConfig {
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  GRAPHQL_ENDPOINT: string;
  DB_DATA_DIR: string;
  ENABLE_FILE_LOGGING: boolean;
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
  SUMMARY_LOG_INTERVAL: number;
}

export interface ElasticApmConfig {
  SERVICE_NAME: string;
  SERVER_URL: string;
  SERVICE_VERSION: string;
  ENVIRONMENT: string;
}

export interface OpenReplayConfig {
  PROJECT_KEY: string;
  INGEST_POINT: string;
}

export interface CSVConfig {
  FILE_UPLOAD_LIMIT: number;
}

export interface AzureConfig {
  CLIENT_ID: string;
  TENANT_ID: string;
  REDIRECT_URI: string;
}

export interface BackendConfig {
  application: ApplicationConfig;
  capella: CapellaConfig;
  openTelemetry: OpenTelemetryConfig;
}

export interface FrontendConfig {
  openreplay: OpenReplayConfig;
  csv: CSVConfig;
  elasticApm: ElasticApmConfig;
  azure: AzureConfig;
}
