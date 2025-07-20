/* src/apm-config.ts */

import { init as initApm } from "@elastic/apm-rum";
import { envSchema } from "./env/schema";

const env = import.meta.env;

const apm = initApm({
  serviceName: env.PUBLIC_ELASTIC_APM_SERVICE_NAME,
  serverUrl: env.PUBLIC_ELASTIC_APM_SERVER_URL,
  serviceVersion: env.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
  environment: env.PUBLIC_ELASTIC_APM_ENVIRONMENT,
  active: true,
  logLevel: "warn",
  distributedTracing: false,
  propagateTracestate: false,
  ignoreTransactions: [
    "/login",
    "/login/*",
    "https://api.openreplay.com/ingest/*",
    "/ingest/v1/web/*",
  ],
});

console.log("APM RUM Config:", {
  serviceName: env.PUBLIC_ELASTIC_APM_SERVICE_NAME,
  serverUrl: env.PUBLIC_ELASTIC_APM_SERVER_URL,
  serviceVersion: env.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
  environment: env.PUBLIC_ELASTIC_APM_ENVIRONMENT,
});

if (import.meta.env.DEV) {
  console.group("🔍 APM RUM Initialization Check");
  console.log("APM Instance:", !!apm);
  console.log("APM Active:", apm.isActive());
  console.log("Service Name:", env.PUBLIC_ELASTIC_APM_SERVICE_NAME);
  console.log("Server URL:", env.PUBLIC_ELASTIC_APM_SERVER_URL);
  console.groupEnd();
}

export default apm;
