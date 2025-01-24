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
    // Only include origins we want to trace
    'https://eu-b2b.apm.eu-central-1.aws.cloud.es.io',
    'https://capella-document-search.prd.shared-services.eu.pvh.cloud',
    // Explicitly allow OpenReplay WebSocket connections
    'ws://api.openreplay.com/ws-assist/socket/*',
    'wss://api.openreplay.com/ws-assist/socket/*',
    'ws://openreplay.prd.shared-services.eu.pvh.cloud/ws-assist/socket/*',
    'wss://openreplay.prd.shared-services.eu.pvh.cloud/ws-assist/socket/*'
  ],
  // Update ignore patterns to be more specific
  ignoreTransactions: [
    '/ingest/v1/web/*',
    '!/ws-assist/socket/*'  // Don't ignore assist socket connections
  ],
  propagateTracestate: false,  // Keep this disabled globally
  // Add explicit allowed origins for WebSocket
  allowedOrigins: [
    'api.openreplay.com',
    'openreplay.prd.shared-services.eu.pvh.cloud'
  ]
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
