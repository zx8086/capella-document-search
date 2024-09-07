/* static/elastic-apm-rum-debug-wrapper.js */

console.log("Debug: Starting Elastic APM RUM script");
(function () {
  var originalElasticApm = window.elasticApm;
  Object.defineProperty(window, "elasticApm", {
    get: function () {
      console.log("Debug: Accessing window.elasticApm");
      return originalElasticApm;
    },
    set: function (value) {
      console.log("Debug: Setting window.elasticApm", value);
      originalElasticApm = value;
    },
    configurable: true,
  });
})();
