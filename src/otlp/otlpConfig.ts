/* src/otlp/otlpConfig.ts */

import { backendConfig } from "../backend-config";

export const otlpConfig = {
  logIntervalMs: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
};
