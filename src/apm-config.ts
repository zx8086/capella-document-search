/* src/apm-config.ts */

import { init as initApm } from "@elastic/apm-rum";
import { envSchema } from "./env/schema";

const env = import.meta.env;

const apm = initApm({
  serviceName: env[envSchema.elastic.serviceName],
  serverUrl: env[envSchema.elastic.serverUrl],
  serviceVersion: env[envSchema.elastic.serviceVersion],
  environment: env[envSchema.elastic.environment],
  active: true,
  logLevel: 'debug',
  distributedTracing: true,
  distributedTracingOrigins: [
    // Only include origins we specifically want to trace
    'https://eu-b2b.apm.eu-central-1.aws.cloud.es.io',
    'https://capellaql.prd.shared-services.eu.pvh.cloud',
    'http://collector.prd.shared-services.eu.pvh.cloud',
    'https://cloudapi.cloud.couchbase.com',
    'https://apm.siobytes.com',
    'http://localhost:4000',
    'http://localhost:5173'
  ],
  // Remove ignoreTransactions as we're using a whitelist approach instead
  propagateTracestate: false,
});

console.log("APM Config:", {
  serviceName: env[envSchema.elastic.serviceName],
  serverUrl: env[envSchema.elastic.serverUrl],
  serviceVersion: env[envSchema.elastic.serviceVersion],
  environment: env[envSchema.elastic.environment],
});

if (import.meta.env.DEV) {
    console.group('🔍 APM Initialization Check');
    console.log('APM Instance:', !!apm);
    console.log('APM Active:', apm.isActive());
    console.log('Service Name:', env[envSchema.elastic.serviceName]);
    console.log('Server URL:', env[envSchema.elastic.serverUrl]);
    console.groupEnd();
}

export default apm;
