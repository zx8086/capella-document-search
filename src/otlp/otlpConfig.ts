/* src/otlp/otlpConfig.ts */

import { backendConfig } from "$backendConfig";

export const otlpConfig = {
  logIntervalMs: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
};
