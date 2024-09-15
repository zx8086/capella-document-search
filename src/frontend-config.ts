/* src/frontend-config.ts */

import * as env from "./env/static/public";
import type { FrontendConfig } from "./models/types";

export const frontendConfig: FrontendConfig = {
  openreplay: {
    PROJECT_KEY: env.PUBLIC_OPENREPLAY_PROJECT_KEY,
    INGEST_POINT: env.PUBLIC_OPENREPLAY_INGEST_POINT,
  },
  csv: {
    FILE_UPLOAD_LIMIT: Number(env.PUBLIC_CSV_FILE_UPLOAD_LIMIT),
  },
  elasticApm: {
    SERVICE_NAME: env.PUBLIC_ELASTIC_APM_SERVICE_NAME,
    SERVER_URL: env.PUBLIC_ELASTIC_APM_SERVER_URL,
    SERVICE_VERSION: env.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
    ENVIRONMENT: env.PUBLIC_ELASTIC_APM_ENVIRONMENT,
  },
} as const;

export type { FrontendConfig } from "./models/types";
