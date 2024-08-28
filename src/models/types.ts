/* src/models/types.ts */

export interface ApplicationConfig {
  HEALTH_CHECK_PORT: number;
  HEALTH_CHECK_LOG_INTERVAL: number;
  HEALTH_CHECK_INTERVAL: number;
  CRON_SCHEDULE: string;
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
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
  CONSOLE_METRIC_READER_INTERVAL: number;
}

export interface MessagingConfig {
  ALERT_TYPE: string;
  SLACK_WEBHOOK_URL: string;
  TEAMS_WEBHOOK_URL: string;
}

export interface OpenReplayConfig {
  VITE_OPENREPLAY_PROJECT_KEY: string;
  VITE_OPENREPLAY_INGEST_POINT: string;
}

export interface BackendConfig {
  application: ApplicationConfig;
  capella: CapellaConfig;
  openTelemetry: OpenTelemetryConfig;
  messaging: MessagingConfig;
}

export interface FrontendConfig {
  openreplay: OpenReplayConfig;
}
