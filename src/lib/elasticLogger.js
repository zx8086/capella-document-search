// src/lib/elasticLogger.js

function createLogger(level) {
  return (message, meta = {}) => {
    if (window.elasticApm) {
      switch (level) {
        case "error":
          window.elasticApm.captureError(message, { custom: meta });
          break;
        case "warn":
        case "log":
        case "info":
        case "debug":
          // Use addSpan for non-error logs
          const span = window.elasticApm.startSpan(message, "custom.log");
          if (span) {
            span.addLabels(meta);
            span.end();
          }
          break;
      }
    }
    // Fallback to console for local debugging
    console[level](message, meta);
  };
}

export const log = createLogger("log");
export const error = createLogger("error");
export const warn = createLogger("warn");
export const info = createLogger("info");
export const debug = createLogger("debug");

// Convenience method for setting custom context
export function setCustomContext(context) {
  if (window.elasticApm) {
    window.elasticApm.setCustomContext(context);
  }
}
