/* src/config.ts */

import { getEnvOrThrow } from "./utils";
import type { FrontendConfig } from "./models/types";

const frontendConfig: FrontendConfig = {
  openreplay: {
    VITE_OPENREPLAY_PROJECT_KEY: getEnvOrThrow("VITE_OPENREPLAY_PROJECT_KEY"),
    VITE_OPENREPLAY_INGEST_POINT: getEnvOrThrow("VITE_OPENREPLAY_INGEST_POINT"),
  },
};

export { frontendConfig };
export default frontendConfig;
export type { FrontendConfig } from "./models/types";
