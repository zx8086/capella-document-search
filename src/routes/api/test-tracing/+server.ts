// Test OpenTelemetry 2025-compliant tracing implementation

import { trace } from "@opentelemetry/api";
import { json } from "@sveltejs/kit";
import { debug, err, log, telemetry, warn } from "../../../otel/index";

export async function GET({ url, request }) {
  const message = url.searchParams.get("message") || "OpenTelemetry 2025 test message";

  return await telemetry.traceHttpOperation(
    "test-tracing-endpoint",
    async () => {
      log("Test tracing endpoint called", {
        message,
        userAgent: request.headers.get("user-agent"),
      });

      // Test different log levels with trace correlation
      debug("Debug message with trace context");
      log("Info message with automatic trace correlation");
      warn("Warning message - testing sampling priority");

      // Test database operation tracing
      const dbResult = await telemetry.traceDatabaseOperation(
        "test-query",
        async () => {
          // Simulate database operation
          if (typeof Bun !== "undefined") {
            await Bun.sleep(100);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return { rows: 42, query_time_ms: 95 };
        },
        {
          operation_type: "select",
          collection: "test_collection",
        }
      );

      // Test RAG operation tracing
      const ragResult = await telemetry.traceRagOperation(
        "test-embedding",
        async () => {
          // Simulate RAG operation
          if (typeof Bun !== "undefined") {
            await Bun.sleep(200);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          return { embeddings: [0.1, 0.2, 0.3], dimensions: 1536 };
        },
        {
          provider: "bedrock",
          operation_type: "embedding",
        }
      );

      // Test chat operation tracing
      const chatResult = await telemetry.traceChatOperation(
        "test-completion",
        async () => {
          // Simulate chat completion
          if (typeof Bun !== "undefined") {
            await Bun.sleep(150);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return {
            response: `Processed: ${message}`,
            tokens_used: 120,
            model_version: "anthropic.claude-3-5-sonnet",
          };
        },
        {
          model: "anthropic.claude-3-5-sonnet",
          provider: "bedrock",
        }
      );

      // Test manual span creation with custom attributes
      const tracer = trace.getTracer("test-tracer");
      const customResult = await tracer.startActiveSpan("custom-operation", async (span) => {
        span.setAttributes({
          "custom.attribute": "test-value",
          "bun.version": typeof Bun !== "undefined" ? Bun.version : "N/A",
          "operation.type": "validation",
        });

        try {
          // Simulate custom operation
          const result = {
            validation_passed: true,
            checks_performed: 5,
            runtime: typeof Bun !== "undefined" ? "bun" : "node",
          };

          span.setAttributes({ "validation.result": "passed" });
          return result;
        } finally {
          span.end();
        }
      });

      // Test error logging (won't throw, just logs)
      err("Test error log - this is expected for testing", {
        test_context: "tracing-validation",
        severity: "test",
      });

      const telemetryStatus = telemetry.getStatus();

      log("Test tracing endpoint completed successfully", {
        db_rows: dbResult.rows,
        rag_dimensions: ragResult.dimensions,
        chat_tokens: chatResult.tokens_used,
        validation_checks: customResult.checks_performed,
        telemetry_health: telemetryStatus,
      });

      return json({
        success: true,
        message: "OpenTelemetry 2025-compliant tracing test completed",
        results: {
          original_message: message,
          database_operation: dbResult,
          rag_operation: ragResult,
          chat_operation: chatResult,
          custom_operation: customResult,
          telemetry_status: telemetryStatus,
        },
        compliance: {
          sampling_rate: "15% (2025 standard)",
          batch_size: "2048 spans",
          queue_capacity: "10,000",
          context_propagation: "W3C TraceContext",
          metrics_units: "UCUM seconds",
          export_timeout: "30 seconds",
          compression: "gzip",
        },
      });
    },
    {
      method: "GET",
      route: "/api/test-tracing",
    }
  );
}

export async function POST({ request }) {
  return await telemetry.traceHttpOperation(
    "test-tracing-post",
    async () => {
      const body = await request.json();

      // Test error scenario for sampling validation
      if (body?.simulate_error) {
        err("Simulated error for sampling test", { request_body: body });
        throw new Error("Simulated error - this tests error sampling priority");
      }

      log("POST request processed", { body_keys: Object.keys(body || {}) });

      return json({
        success: true,
        message: "POST request traced successfully",
        received: body,
        telemetry_status: telemetry.getStatus(),
      });
    },
    {
      method: "POST",
      route: "/api/test-tracing",
    }
  );
}
