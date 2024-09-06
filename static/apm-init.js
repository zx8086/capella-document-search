/* static/apm-init.js */

import { frontendConfig } from "./src/config";

document.addEventListener("DOMContentLoaded", function () {
  const apmConfig = frontendConfig.elasticApm;

  console.log("APM Config:", apmConfig);

  console.log("Full APM Config:", JSON.stringify(apmConfig, null, 2));
  console.log(
    "Distributed Tracing Origins:",
    apmConfig.VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS.split(",").map(
      (origin) => origin.trim(),
    ),
  );

  if (window.elasticApm) {
    try {
      window.elasticApm.init({
        serviceName: apmConfig.VITE_ELASTIC_APM_SERVICE_NAME,
        serverUrl: apmConfig.VITE_ELASTIC_APM_SERVER_URL,
        serviceVersion: apmConfig.VITE_ELASTIC_APM_SERVICE_VERSION,
        environment: apmConfig.VITE_ELASTIC_APM_ENVIRONMENT,
        active: true,
        logLevel: "debug",
        breakdownMetrics: true,
        centralConfig: true,
        distributedTracingOrigins:
          apmConfig.VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS,
        transactionSampleRate: 1.0,
      });
      console.log("Elastic APM initialized.");
    } catch (e) {
      console.error("Error initializing Elastic APM RUM:", e);
    }
  } else {
    console.error("Elastic APM RUM script not loaded correctly.");
  }
});
