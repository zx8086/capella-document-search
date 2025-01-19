import { trace } from "@opentelemetry/api";
import { log, debug, warn, err } from "$utils/serverLogger";

export async function GET() {
  const tracer = trace.getTracer("test-logging");
  
  return await tracer.startActiveSpan("test-logging-operation", async (span) => {
    try {
      // Test different log levels with trace context
      debug("Debug message from test endpoint");
      log("Info message from test endpoint");
      warn("Warning message from test endpoint");
      err("Error message from test endpoint", { someMetadata: "test" });
      
      span.end();
      return new Response("Logging test completed", { status: 200 });
    } catch (error) {
      span.end();
      return new Response("Error during logging test", { status: 500 });
    }
  });
} 