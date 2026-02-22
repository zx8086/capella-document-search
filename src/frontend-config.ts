/* src/frontend-config.ts */

import { z } from "zod";

const OpenReplayConfigSchema = z.object({
  PROJECT_KEY: z.string(),
  INGEST_POINT: z.string().url("OpenReplay ingest point must be a valid URL"),
});

const CsvConfigSchema = z.object({
  FILE_UPLOAD_LIMIT: z.number().positive("CSV file upload limit must be positive"),
});

const ElasticApmConfigSchema = z.object({
  SERVICE_NAME: z.string().min(1, "Elastic APM service name is required"),
  SERVER_URL: z.string().url("Elastic APM server URL must be a valid URL"),
  SERVICE_VERSION: z.string().min(1, "Elastic APM service version is required"),
  ENVIRONMENT: z.enum(["development", "staging", "production"], {
    errorMap: () => ({
      message: "Environment must be development, staging, or production",
    }),
  }),
});

const AzureConfigSchema = z.object({
  CLIENT_ID: z.string(),
  TENANT_ID: z.string(),
  REDIRECT_URI: z.string().url("Azure redirect URI must be a valid URL").or(z.literal("")),
});

const GrowthBookConfigSchema = z.object({
  apiHost: z.string().url("GrowthBook API host must be a valid URL"),
  clientKey: z.string(),
  encryptionKey: z.string(),
});

const FrontendConfigSchema = z.object({
  openreplay: OpenReplayConfigSchema,
  csv: CsvConfigSchema,
  elasticApm: ElasticApmConfigSchema,
  azure: AzureConfigSchema,
  growthbook: GrowthBookConfigSchema,
});

export type FrontendConfig = z.infer<typeof FrontendConfigSchema>;

const defaultConfig: FrontendConfig = {
  openreplay: {
    PROJECT_KEY: "",
    INGEST_POINT: "https://api.openreplay.com/ingest",
  },
  csv: {
    FILE_UPLOAD_LIMIT: 1000,
  },
  elasticApm: {
    SERVICE_NAME: "capella-document-search",
    SERVER_URL: "https://eu-b2b.apm.eu-central-1.aws.cloud.es.io",
    SERVICE_VERSION: "1.0.0",
    ENVIRONMENT: "development",
  },
  azure: {
    CLIENT_ID: "",
    TENANT_ID: "",
    REDIRECT_URI: "",
  },
  growthbook: {
    apiHost: "https://cdn.growthbook.io",
    clientKey: "",
    encryptionKey: "",
  },
};

function loadFrontendConfig(): FrontendConfig {
  try {
    const env = import.meta.env;

    const envConfig: Partial<FrontendConfig> = {
      openreplay: {
        PROJECT_KEY: env.PUBLIC_OPENREPLAY_PROJECT_KEY || "",
        INGEST_POINT: env.PUBLIC_OPENREPLAY_INGEST_POINT || defaultConfig.openreplay.INGEST_POINT,
      },
      csv: {
        FILE_UPLOAD_LIMIT: env.PUBLIC_CSV_FILE_UPLOAD_LIMIT
          ? Number(env.PUBLIC_CSV_FILE_UPLOAD_LIMIT)
          : defaultConfig.csv.FILE_UPLOAD_LIMIT,
      },
      elasticApm: {
        SERVICE_NAME: env.PUBLIC_ELASTIC_APM_SERVICE_NAME || defaultConfig.elasticApm.SERVICE_NAME,
        SERVER_URL: env.PUBLIC_ELASTIC_APM_SERVER_URL || defaultConfig.elasticApm.SERVER_URL,
        SERVICE_VERSION:
          env.PUBLIC_ELASTIC_APM_SERVICE_VERSION || defaultConfig.elasticApm.SERVICE_VERSION,
        ENVIRONMENT:
          (env.PUBLIC_ELASTIC_APM_ENVIRONMENT as "development" | "staging" | "production") ||
          defaultConfig.elasticApm.ENVIRONMENT,
      },
      azure: {
        CLIENT_ID: env.PUBLIC_AZURE_CLIENT_ID || "",
        TENANT_ID: env.PUBLIC_AZURE_TENANT_ID || "",
        REDIRECT_URI: env.PUBLIC_AZURE_REDIRECT_URI || "",
      },
      growthbook: {
        apiHost: env.PUBLIC_GROWTHBOOK_API_HOST || defaultConfig.growthbook.apiHost,
        clientKey: env.PUBLIC_GROWTHBOOK_CLIENT_KEY || "",
        encryptionKey: env.PUBLIC_GROWTHBOOK_ENCRYPTION_KEY || "",
      },
    };

    const mergedConfig = { ...defaultConfig, ...envConfig };
    const validatedConfig = FrontendConfigSchema.parse(mergedConfig);

    console.debug("Frontend configuration loaded successfully");
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Frontend configuration validation failed:", {
        errors: error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
          code: err.code,
        })),
      });
      throw new Error(
        `Frontend configuration validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
      );
    }

    console.error("Failed to load frontend configuration:", error);
    throw new Error("Failed to load frontend configuration");
  }
}

export const frontendConfig = loadFrontendConfig();

export {
  FrontendConfigSchema,
  OpenReplayConfigSchema,
  CsvConfigSchema,
  ElasticApmConfigSchema,
  AzureConfigSchema,
  GrowthBookConfigSchema,
};
