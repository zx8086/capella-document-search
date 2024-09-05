/* src/config.ts */

import { getEnvOrThrow, getEnvNumberOrThrow } from "./utils";
import type { FrontendConfig } from "./models/types";

const frontendConfig: FrontendConfig = {
  openreplay: {
    VITE_OPENREPLAY_PROJECT_KEY: getEnvOrThrow("VITE_OPENREPLAY_PROJECT_KEY"),
    VITE_OPENREPLAY_INGEST_POINT: getEnvOrThrow("VITE_OPENREPLAY_INGEST_POINT"),
  },
  csv: {
    VITE_FILE_UPLOAD_LIMIT: getEnvNumberOrThrow("VITE_FILE_UPLOAD_LIMIT"),
  },
  elasticApm: {
    VITE_ELASTIC_APM_SERVICE_NAME: getEnvOrThrow(
      "VITE_ELASTIC_APM_SERVICE_NAME",
    ),
    VITE_ELASTIC_APM_SERVER_URL: getEnvOrThrow("VITE_ELASTIC_APM_SERVER_URL"),
    VITE_ELASTIC_APM_SERVICE_VERSION: getEnvOrThrow(
      "VITE_ELASTIC_APM_SERVICE_VERSION",
    ),
    VITE_ELASTIC_APM_ENVIRONMENT: getEnvOrThrow("VITE_ELASTIC_APM_ENVIRONMENT"),
    VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS: getEnvOrThrow(
      "VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS",
    ),
  },
};

export { frontendConfig };
export default frontendConfig;
export type { FrontendConfig } from "./models/types";
