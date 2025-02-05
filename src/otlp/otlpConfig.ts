/* src/otlp/otlpConfig.ts */

import { backendConfig } from "../backend-config";

export const otlpConfig = {
  logIntervalMs: backendConfig.openTelemetry.SUMMARY_LOG_INTERVAL,
  isEnabled: () => {
    // Check enable flag first
    const enableFlag = process.env.ENABLE_OPENTELEMETRY?.toLowerCase();
    if (enableFlag === 'true') return true;
    
    // Check disable flag second (for backwards compatibility)
    const disableFlag = process.env.DISABLE_OPENTELEMETRY?.toLowerCase();
    if (disableFlag === 'true') return false;
    
    // Default to enabled if in production, disabled otherwise
    return process.env.NODE_ENV === 'production';
  },
  validateConfig: () => {
    const enabled = otlpConfig.isEnabled();
    
    if (enabled) {
      // Log the configuration state
      console.debug('OpenTelemetry Configuration:', {
        ENABLE_OPENTELEMETRY: process.env.ENABLE_OPENTELEMETRY,
        DISABLE_OPENTELEMETRY: process.env.DISABLE_OPENTELEMETRY,
        NODE_ENV: process.env.NODE_ENV,
        isEnabled: enabled
      });
    }
    
    return enabled;
  }
};
