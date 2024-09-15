/* static/apm-init.js */

(function () {
  console.log("APM init script loaded");
  function initAPM() {
    console.log("Initializing APM");
    console.log("ENV variables:", {
      serviceName: window.ENV.PUBLIC_ELASTIC_APM_SERVICE_NAME,
      serverUrl: window.ENV.PUBLIC_ELASTIC_APM_SERVER_URL,
      serviceVersion: window.ENV.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
      environment: window.ENV.PUBLIC_ELASTIC_APM_ENVIRONMENT,
    });

    if (window.elasticApm) {
      try {
        console.log("Attempting to initialize Elastic APM");
        window.elasticApm.init({
          serviceName: window.ENV.PUBLIC_ELASTIC_APM_SERVICE_NAME,
          pageLoadTransactionName: "/homepage",
          serverUrl: window.ENV.PUBLIC_ELASTIC_APM_SERVER_URL,
          serviceVersion: window.ENV.PUBLIC_ELASTIC_APM_SERVICE_VERSION,
          environment: window.ENV.PUBLIC_ELASTIC_APM_ENVIRONMENT,
          active: true,
          logLevel: "debug",
          breakdownMetrics: true,
          centralConfig: false,
          disableInstrumentations: [
            "https://openreplay.prd.shared-services.eu.pvh.cloud",
          ],
          transactionSampleRate: 1.0,
        });
        console.log("Elastic APM initialized successfully.");
      } catch (e) {
        console.error("Error initializing Elastic APM RUM:", e);
      }
    } else {
      console.error(
        "Elastic APM RUM script not loaded correctly. window.elasticApm is:",
        window.elasticApm,
      );
    }
  }
  initAPM();
})();
