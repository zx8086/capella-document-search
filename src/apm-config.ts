/* src/apm-config.ts */

import { init as initApm } from "@elastic/apm-rum";
import { envSchema } from "./env/schema";

const env = import.meta.env;

const apm = initApm({
  serviceName: env[envSchema.elastic.serviceName],
  serverUrl: env[envSchema.elastic.serverUrl],
  serviceVersion: env[envSchema.elastic.serviceVersion],
  environment: env[envSchema.elastic.environment],
});

console.log("APM Config:", {
  serviceName: env[envSchema.elastic.serviceName],
  serverUrl: env[envSchema.elastic.serverUrl],
  serviceVersion: env[envSchema.elastic.serviceVersion],
  environment: env[envSchema.elastic.environment],
});

export default apm;
