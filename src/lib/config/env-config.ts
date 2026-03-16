import { z } from "zod";

const ApplicationConfigSchema = z.object({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_MAX_SIZE: z.string().default("20m"),
  LOG_MAX_FILES: z.string().default("14d"),
  GRAPHQL_ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
  DB_DATA_DIR: z.string().default("src/data"),
  ENABLE_FILE_LOGGING: z.boolean().default(true),
});

const CapellaConfigSchema = z.object({
  API_BASE_URL: z.string().default("https://cloudapi.cloud.couchbase.com/v4"),
  ORG_ID: z.string().default("9d75c6a4-2ec3-4a6c-8574-b3842eeaa4b5"),
  PROJECT_ID: z.string().default("1c249d82-f799-4b08-a8c0-18f7088e5049"),
  CLUSTER_ID: z.string().default("2091944c-177f-450e-9266-9761679ebc73"),
  BUCKET_ID: z.string().default("ZGVmYXVsdA=="),
  AUTH_TOKEN: z.string().default(""),
  URL: z.string().default(""),
  USERNAME: z.string().default(""),
  PASSWORD: z.string().default(""),
  BUCKET: z.string().default("default"),
  SCOPE: z.string().default("_default"),
  COLLECTION: z.string().default("_default"),
  VECTOR_INDEX: z.string().default("default._default.ragpdfindex"),
});

const OpenTelemetryConfigSchema = z.object({
  SERVICE_NAME: z.string().default("Capella Document Search"),
  SERVICE_VERSION: z.string().default("2.0.2"),
  DEPLOYMENT_ENVIRONMENT: z.enum(["development", "staging", "production"]).default("development"),
  TRACES_ENDPOINT: z.string().default("https://otel-http-traces.siobytes.com"),
  METRICS_ENDPOINT: z.string().default("https://otel-http-metrics.siobytes.com"),
  LOGS_ENDPOINT: z.string().default("https://otel-http-logs.siobytes.com"),
  METRIC_READER_INTERVAL: z.number().min(1000).max(300000).default(60000),
  SUMMARY_LOG_INTERVAL: z.number().min(1000).max(600000).default(300000),
});

const RagConfigSchema = z.object({
  RAG_PIPELINE: z
    .enum(["PINECONE", "CAPELLA", "VECTORIZE", "AWS_KNOWLEDGE_BASE"])
    .default("PINECONE"),
  OPENAI_API_KEY: z.string().default(""),
  PINECONE_API_KEY: z.string().default(""),
  PINECONE_INDEX_NAME: z.string().default("platform-engineering-rag"),
  PINECONE_NAMESPACE: z.string().default("capella-document-search"),
  AWS_REGION: z.string().default("eu-central-1"),
  // IAM credentials (only needed if NOT using Bedrock API key)
  AWS_ACCESS_KEY_ID: z.string().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().default(""),
  // Bedrock API key (starts with "ABSK") - preferred for long-lived auth
  // When set, IAM credentials above are ignored
  AWS_BEARER_TOKEN_BEDROCK: z.string().default(""),
  BEDROCK_EMBEDDING_MODEL: z.string().default("amazon.titan-embed-text-v1"),
  BEDROCK_CHAT_MODEL: z.string().default("anthropic.claude-3-5-sonnet-20240620-v1:0"),
});

const ConfigSchema = z.object({
  application: ApplicationConfigSchema,
  capella: CapellaConfigSchema,
  openTelemetry: OpenTelemetryConfigSchema,
  rag: RagConfigSchema,
});

type Config = z.infer<typeof ConfigSchema>;

// Default configuration
const defaultConfig: Config = {
  application: {
    LOG_LEVEL: "info",
    LOG_MAX_SIZE: "20m",
    LOG_MAX_FILES: "14d",
    GRAPHQL_ENDPOINT: "http://localhost:4000/graphql",
    DB_DATA_DIR: "src/data",
    ENABLE_FILE_LOGGING: true,
  },
  capella: {
    API_BASE_URL: "https://cloudapi.cloud.couchbase.com/v4",
    ORG_ID: "9d75c6a4-2ec3-4a6c-8574-b3842eeaa4b5",
    PROJECT_ID: "1c249d82-f799-4b08-a8c0-18f7088e5049",
    CLUSTER_ID: "2091944c-177f-450e-9266-9761679ebc73",
    BUCKET_ID: "ZGVmYXVsdA==",
    AUTH_TOKEN: "",
    URL: "",
    USERNAME: "",
    PASSWORD: "",
    BUCKET: "default",
    SCOPE: "_default",
    COLLECTION: "_default",
    VECTOR_INDEX: "default._default.ragpdfindex",
  },
  openTelemetry: {
    SERVICE_NAME: "Capella Document Search",
    SERVICE_VERSION: "2.0.2",
    DEPLOYMENT_ENVIRONMENT: "development",
    TRACES_ENDPOINT: "https://otel-http-traces.siobytes.com",
    METRICS_ENDPOINT: "https://otel-http-metrics.siobytes.com",
    LOGS_ENDPOINT: "https://otel-http-logs.siobytes.com",
    METRIC_READER_INTERVAL: 60000,
    SUMMARY_LOG_INTERVAL: 300000,
  },
  rag: {
    RAG_PIPELINE: "PINECONE",
    OPENAI_API_KEY: "",
    PINECONE_API_KEY: "",
    PINECONE_INDEX_NAME: "platform-engineering-rag",
    PINECONE_NAMESPACE: "capella-document-search",
    AWS_REGION: "eu-central-1",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_BEARER_TOKEN_BEDROCK: "",
    BEDROCK_EMBEDDING_MODEL: "amazon.titan-embed-text-v1",
    BEDROCK_CHAT_MODEL: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
};

// Environment variable mapping
const envVarMapping = {
  application: {
    LOG_LEVEL: "LOG_LEVEL",
    LOG_MAX_SIZE: "LOG_MAX_SIZE",
    LOG_MAX_FILES: "LOG_MAX_FILES",
    GRAPHQL_ENDPOINT: "GRAPHQL_ENDPOINT",
    DB_DATA_DIR: "DB_DATA_DIR",
    ENABLE_FILE_LOGGING: "ENABLE_FILE_LOGGING",
  },
  capella: {
    API_BASE_URL: "API_BASE_URL",
    ORG_ID: "ORG_ID",
    PROJECT_ID: "PROJECT_ID",
    CLUSTER_ID: "CLUSTER_ID",
    BUCKET_ID: "BUCKET_ID",
    AUTH_TOKEN: "AUTH_TOKEN",
    URL: "COUCHBASE_URL",
    USERNAME: "COUCHBASE_USERNAME",
    PASSWORD: "COUCHBASE_PASSWORD",
    BUCKET: "COUCHBASE_BUCKET",
    SCOPE: "COUCHBASE_SCOPE",
    COLLECTION: "COUCHBASE_COLLECTION",
    VECTOR_INDEX: "COUCHBASE_VECTOR_INDEX",
  },
  openTelemetry: {
    SERVICE_NAME: "SERVICE_NAME",
    SERVICE_VERSION: "SERVICE_VERSION",
    DEPLOYMENT_ENVIRONMENT: "DEPLOYMENT_ENVIRONMENT",
    TRACES_ENDPOINT: "TRACES_ENDPOINT",
    METRICS_ENDPOINT: "METRICS_ENDPOINT",
    LOGS_ENDPOINT: "LOGS_ENDPOINT",
    METRIC_READER_INTERVAL: "METRIC_READER_INTERVAL",
    SUMMARY_LOG_INTERVAL: "SUMMARY_LOG_INTERVAL",
  },
  rag: {
    RAG_PIPELINE: "RAG_PIPELINE",
    OPENAI_API_KEY: "OPENAI_API_KEY",
    PINECONE_API_KEY: "PINECONE_API_KEY",
    PINECONE_INDEX_NAME: "PINECONE_INDEX_NAME",
    PINECONE_NAMESPACE: "PINECONE_NAMESPACE",
    AWS_REGION: "AWS_REGION",
    AWS_ACCESS_KEY_ID: "AWS_ACCESS_KEY_ID",
    AWS_SECRET_ACCESS_KEY: "AWS_SECRET_ACCESS_KEY",
    AWS_BEARER_TOKEN_BEDROCK: "AWS_BEARER_TOKEN_BEDROCK",
    BEDROCK_EMBEDDING_MODEL: "BEDROCK_EMBEDDING_MODEL",
    BEDROCK_CHAT_MODEL: "BEDROCK_CHAT_MODEL",
  },
};

// Helper function to get environment variable
function getEnvVar(key: string): string | undefined {
  // Try multiple sources in order
  if (process.env[key]) return process.env[key];
  if (typeof Bun !== "undefined" && Bun.env?.[key]) return Bun.env[key];
  return undefined;
}

// Helper function to parse environment variables
function parseEnvVar(value: string | undefined, type: "string" | "number" | "boolean"): unknown {
  if (value === undefined) return undefined;
  if (type === "number") return Number(value);
  if (type === "boolean") return value.toLowerCase() === "true";
  return value;
}

// Load configuration from environment variables
function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  // Load application config
  config.application = {
    LOG_LEVEL:
      (parseEnvVar(getEnvVar(envVarMapping.application.LOG_LEVEL), "string") as
        | "debug"
        | "info"
        | "warn"
        | "error") || defaultConfig.application.LOG_LEVEL,
    LOG_MAX_SIZE:
      (parseEnvVar(getEnvVar(envVarMapping.application.LOG_MAX_SIZE), "string") as string) ||
      defaultConfig.application.LOG_MAX_SIZE,
    LOG_MAX_FILES:
      (parseEnvVar(getEnvVar(envVarMapping.application.LOG_MAX_FILES), "string") as string) ||
      defaultConfig.application.LOG_MAX_FILES,
    GRAPHQL_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.application.GRAPHQL_ENDPOINT), "string") as string) ||
      defaultConfig.application.GRAPHQL_ENDPOINT,
    DB_DATA_DIR:
      (parseEnvVar(getEnvVar(envVarMapping.application.DB_DATA_DIR), "string") as string) ||
      defaultConfig.application.DB_DATA_DIR,
    ENABLE_FILE_LOGGING:
      (parseEnvVar(
        getEnvVar(envVarMapping.application.ENABLE_FILE_LOGGING),
        "boolean"
      ) as boolean) ?? defaultConfig.application.ENABLE_FILE_LOGGING,
  };

  // Load capella config
  config.capella = {
    API_BASE_URL:
      (parseEnvVar(getEnvVar(envVarMapping.capella.API_BASE_URL), "string") as string) ||
      defaultConfig.capella.API_BASE_URL,
    ORG_ID:
      (parseEnvVar(getEnvVar(envVarMapping.capella.ORG_ID), "string") as string) ||
      defaultConfig.capella.ORG_ID,
    PROJECT_ID:
      (parseEnvVar(getEnvVar(envVarMapping.capella.PROJECT_ID), "string") as string) ||
      defaultConfig.capella.PROJECT_ID,
    CLUSTER_ID:
      (parseEnvVar(getEnvVar(envVarMapping.capella.CLUSTER_ID), "string") as string) ||
      defaultConfig.capella.CLUSTER_ID,
    BUCKET_ID:
      (parseEnvVar(getEnvVar(envVarMapping.capella.BUCKET_ID), "string") as string) ||
      defaultConfig.capella.BUCKET_ID,
    AUTH_TOKEN:
      (parseEnvVar(getEnvVar(envVarMapping.capella.AUTH_TOKEN), "string") as string) ||
      defaultConfig.capella.AUTH_TOKEN,
    URL:
      (parseEnvVar(getEnvVar(envVarMapping.capella.URL), "string") as string) ||
      defaultConfig.capella.URL,
    USERNAME:
      (parseEnvVar(getEnvVar(envVarMapping.capella.USERNAME), "string") as string) ||
      defaultConfig.capella.USERNAME,
    PASSWORD:
      (parseEnvVar(getEnvVar(envVarMapping.capella.PASSWORD), "string") as string) ||
      defaultConfig.capella.PASSWORD,
    BUCKET:
      (parseEnvVar(getEnvVar(envVarMapping.capella.BUCKET), "string") as string) ||
      defaultConfig.capella.BUCKET,
    SCOPE:
      (parseEnvVar(getEnvVar(envVarMapping.capella.SCOPE), "string") as string) ||
      defaultConfig.capella.SCOPE,
    COLLECTION:
      (parseEnvVar(getEnvVar(envVarMapping.capella.COLLECTION), "string") as string) ||
      defaultConfig.capella.COLLECTION,
    VECTOR_INDEX:
      (parseEnvVar(getEnvVar(envVarMapping.capella.VECTOR_INDEX), "string") as string) ||
      defaultConfig.capella.VECTOR_INDEX,
  };

  // Load OpenTelemetry config
  config.openTelemetry = {
    SERVICE_NAME:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.SERVICE_NAME), "string") as string) ||
      defaultConfig.openTelemetry.SERVICE_NAME,
    SERVICE_VERSION:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.SERVICE_VERSION), "string") as string) ||
      defaultConfig.openTelemetry.SERVICE_VERSION,
    DEPLOYMENT_ENVIRONMENT:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.DEPLOYMENT_ENVIRONMENT), "string") as
        | "development"
        | "staging"
        | "production") || defaultConfig.openTelemetry.DEPLOYMENT_ENVIRONMENT,
    TRACES_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.TRACES_ENDPOINT), "string") as string) ||
      defaultConfig.openTelemetry.TRACES_ENDPOINT,
    METRICS_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.METRICS_ENDPOINT), "string") as string) ||
      defaultConfig.openTelemetry.METRICS_ENDPOINT,
    LOGS_ENDPOINT:
      (parseEnvVar(getEnvVar(envVarMapping.openTelemetry.LOGS_ENDPOINT), "string") as string) ||
      defaultConfig.openTelemetry.LOGS_ENDPOINT,
    METRIC_READER_INTERVAL:
      (parseEnvVar(
        getEnvVar(envVarMapping.openTelemetry.METRIC_READER_INTERVAL),
        "number"
      ) as number) || defaultConfig.openTelemetry.METRIC_READER_INTERVAL,
    SUMMARY_LOG_INTERVAL:
      (parseEnvVar(
        getEnvVar(envVarMapping.openTelemetry.SUMMARY_LOG_INTERVAL),
        "number"
      ) as number) || defaultConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
  };

  // Load RAG config
  config.rag = {
    RAG_PIPELINE:
      (parseEnvVar(getEnvVar(envVarMapping.rag.RAG_PIPELINE), "string") as
        | "PINECONE"
        | "CAPELLA"
        | "VECTORIZE"
        | "AWS_KNOWLEDGE_BASE") || defaultConfig.rag.RAG_PIPELINE,
    OPENAI_API_KEY:
      (parseEnvVar(getEnvVar(envVarMapping.rag.OPENAI_API_KEY), "string") as string) ||
      defaultConfig.rag.OPENAI_API_KEY,
    PINECONE_API_KEY:
      (parseEnvVar(getEnvVar(envVarMapping.rag.PINECONE_API_KEY), "string") as string) ||
      defaultConfig.rag.PINECONE_API_KEY,
    PINECONE_INDEX_NAME:
      (parseEnvVar(getEnvVar(envVarMapping.rag.PINECONE_INDEX_NAME), "string") as string) ||
      defaultConfig.rag.PINECONE_INDEX_NAME,
    PINECONE_NAMESPACE:
      (parseEnvVar(getEnvVar(envVarMapping.rag.PINECONE_NAMESPACE), "string") as string) ||
      defaultConfig.rag.PINECONE_NAMESPACE,
    AWS_REGION:
      (parseEnvVar(getEnvVar(envVarMapping.rag.AWS_REGION), "string") as string) ||
      defaultConfig.rag.AWS_REGION,
    AWS_ACCESS_KEY_ID:
      (parseEnvVar(getEnvVar(envVarMapping.rag.AWS_ACCESS_KEY_ID), "string") as string) ||
      defaultConfig.rag.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY:
      (parseEnvVar(getEnvVar(envVarMapping.rag.AWS_SECRET_ACCESS_KEY), "string") as string) ||
      defaultConfig.rag.AWS_SECRET_ACCESS_KEY,
    AWS_BEARER_TOKEN_BEDROCK:
      (parseEnvVar(getEnvVar(envVarMapping.rag.AWS_BEARER_TOKEN_BEDROCK), "string") as string) ||
      defaultConfig.rag.AWS_BEARER_TOKEN_BEDROCK,
    BEDROCK_EMBEDDING_MODEL:
      (parseEnvVar(getEnvVar(envVarMapping.rag.BEDROCK_EMBEDDING_MODEL), "string") as string) ||
      defaultConfig.rag.BEDROCK_EMBEDDING_MODEL,
    BEDROCK_CHAT_MODEL:
      (parseEnvVar(getEnvVar(envVarMapping.rag.BEDROCK_CHAT_MODEL), "string") as string) ||
      defaultConfig.rag.BEDROCK_CHAT_MODEL,
  };

  return config;
}

// Initialize configuration
let config: Config;

try {
  // Merge default config with environment variables
  const envConfig = loadConfigFromEnv();
  const mergedConfig = {
    application: { ...defaultConfig.application, ...envConfig.application },
    capella: { ...defaultConfig.capella, ...envConfig.capella },
    openTelemetry: { ...defaultConfig.openTelemetry, ...envConfig.openTelemetry },
    rag: { ...defaultConfig.rag, ...envConfig.rag },
  };

  // Validate and set configuration
  config = ConfigSchema.parse(mergedConfig);
} catch (error) {
  // Use console.error here since logging system may not be initialized yet
  console.error(
    "Configuration validation failed:",
    error instanceof Error ? error.message : String(error)
  );
  throw new Error(
    "Invalid configuration: " + (error instanceof Error ? error.message : String(error))
  );
}

export { config };
export type { Config };
