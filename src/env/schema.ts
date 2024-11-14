// src/env/schema.ts

export const envSchema = {
  openreplay: {
    projectKey: "PUBLIC_OPENREPLAY_PROJECT_KEY",
    ingestPoint: "PUBLIC_OPENREPLAY_INGEST_POINT",
  },
  elastic: {
    serviceName: "PUBLIC_ELASTIC_APM_SERVICE_NAME",
    serverUrl: "PUBLIC_ELASTIC_APM_SERVER_URL",
    serviceVersion: "PUBLIC_ELASTIC_APM_SERVICE_VERSION",
    environment: "PUBLIC_ELASTIC_APM_ENVIRONMENT",
  },
  csv: {
    uploadLimit: "PUBLIC_CSV_FILE_UPLOAD_LIMIT",
  },
  azure: {
    CLIENT_ID: "PUBLIC_AZURE_CLIENT_ID",
    TENANT_ID: "PUBLIC_AZURE_TENANT_ID",
    REDIRECT_URI: "PUBLIC_AZURE_REDIRECT_URI",
  },
} as const;
