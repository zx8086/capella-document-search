/* src/apm-config.ts */

import { init as initApm } from "@elastic/apm-rum";

const apm = initApm({
  serviceName: process.env.PUBLIC_ELASTIC_APM_SERVICE_NAME,
  serverUrl: process.env.PUBLIC_ELASTIC_APM_SERVER_URL,
  serviceVersion: process.env.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
  environment: process.env.PUBLIC_ELASTIC_APM_ENVIRONMENT,
});

export default apm;
