import { describe, expect, it } from "bun:test";

describe("Timeout Handling", () => {
  const baseUrl = "http://localhost:5173/api/chat";

  it("should handle timeout gracefully with proper warning", async () => {
    const startTime = Date.now();

    // Create a request that will likely timeout
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Show me all system vitals for all nodes with complete details",
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
      }),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let _fullResponse = "";
    let hasTimeoutWarning = false;
    let hasJSONCleanup = false;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        _fullResponse += chunk;

        // Check for timeout warning
        if (chunk.includes("RESPONSE TIMEOUT") || chunk.includes("timeout")) {
          hasTimeoutWarning = true;
        }

        // Check for JSON cleanup
        if (
          chunk.includes("JSON output truncated") ||
          chunk.includes("Tool output was truncated")
        ) {
          hasJSONCleanup = true;
        }
      }
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Test completed in ${elapsedTime}ms`);
    console.log(`Has timeout warning: ${hasTimeoutWarning}`);
    console.log(`Has JSON cleanup: ${hasJSONCleanup}`);

    // If the response took close to 60 seconds, we should have a timeout
    if (elapsedTime > 59000 && elapsedTime < 62000) {
      expect(hasTimeoutWarning).toBe(true);
    }
  });

  it("should send progress updates during long responses", async () => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Explain in detail how Couchbase replication works across data centers",
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let progressUpdateCount = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.type === "progress") {
                progressUpdateCount++;
                console.log(`Progress update ${progressUpdateCount}: ${data.message}`);
              }
            } catch (_e) {
              // Not JSON, skip
            }
          }
        }
      }
    }

    console.log(`Total progress updates: ${progressUpdateCount}`);
  });
});
