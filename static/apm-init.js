/* static/apm-init.js */

(function () {
  console.log("APM init script loaded");
  function initAPM(config) {
    console.log("Initializing APM with config:", config);
    if (window.elasticApm) {
      try {
        console.log("Attempting to initialize Elastic APM");
        window.elasticApm.init({
          serviceName: config.VITE_ELASTIC_APM_SERVICE_NAME,
          serverUrl: config.VITE_ELASTIC_APM_SERVER_URL,
          serviceVersion: config.VITE_ELASTIC_APM_SERVICE_VERSION,
          environment: config.VITE_ELASTIC_APM_ENVIRONMENT,
          active: true,
          logLevel: "debug",
          breakdownMetrics: true,
          centralConfig: true,
          distributedTracingOrigins:
            config.VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS?.split(",").map(
              (origin) => origin.trim(),
            ),
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
  function waitForEnv(callback, maxAttempts = 10, interval = 500) {
    let attempts = 0;
    function checkEnv() {
      console.log("Checking for ENV, attempt:", attempts + 1);
      if (window.ENV) {
        console.log("ENV loaded:", window.ENV);
        callback(window.ENV);
      } else if (attempts < maxAttempts) {
        attempts++;
        console.log(`Waiting for ENV to load... Attempt ${attempts}`);
        setTimeout(checkEnv, interval);
      } else {
        console.error("ENV not loaded after maximum attempts");
      }
    }

    // Check if we're in a production environment
    var isProduction =
      window.ENV && window.ENV.VITE_ELASTIC_APM_ENVIRONMENT === "production";

    if (isProduction) {
      console.log("Production environment detected. Initializing APM.");
      checkEnv();
    } else if (window.ENV) {
      console.log(
        "Environment detected:",
        window.ENV.VITE_ELASTIC_APM_ENVIRONMENT,
      );
      checkEnv();
    } else {
      console.log("ENV not available. Attempting to load.");
      checkEnv();
    }
  }
  // Start checking for ENV
  waitForEnv(initAPM);
})();
