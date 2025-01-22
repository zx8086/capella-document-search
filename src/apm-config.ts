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
    // Development origins
    'http://localhost:5173',
    'http://localhost:3000',
    // Production APM endpoints
    'https://apm.siobytes.com',
    'https://eu-b2b.apm.eu-central-1.aws.cloud.es.io',
    // Allow all microsoftonline domains
    /^https:\/\/.*\.microsoftonline\.com$/,
    // Allow all shared-services domains
    /^https:\/\/.*\.shared-services\.eu\.pvh\.cloud$/,
    // Exclude OpenReplay
    '!https://api.openreplay.com',
    '!https://openreplay.prd.shared-services.eu.pvh.cloud'
  ],
  // Use ignoreTransactions instead of ignoreUrls for more precise control
  ignoreTransactions: [
    // Ignore OpenReplay related transactions
    /^OpenReplay/,
    /^\/ingest\/v1\/web/,
    // Ignore feature flags transactions
    /^\/ingest\/v1\/web\/feature-flags/,
    // Ignore specific paths
    'tracker-initialized',
    'tracker-start',
    'tracker-stop'
  ],
  propagateTracestate: true,
  breakdownMetrics: true,
  instrument: true,
  centralConfig: false
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
