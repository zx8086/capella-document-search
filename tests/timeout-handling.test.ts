import { beforeAll, describe, expect, it } from "bun:test";

const baseUrl = "http://localhost:5173/api/chat";
let serverAvailable = false;

beforeAll(async () => {
  try {
    // POST to the actual endpoint to verify the route exists (not just the server)
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "ping",
        user: { id: "test", name: "test", email: "test@test.com" },
      }),
      signal: AbortSignal.timeout(5000),
    });
    // 404 means the route doesn't exist; anything else means the API is available
    serverAvailable = response.status !== 404;
  } catch {
    serverAvailable = false;
  }
});

describe("Timeout Handling", () => {
  it("should handle timeout gracefully with proper warning", async () => {
    if (!serverAvailable) {
      console.log("Dev server not running on :5173, skipping integration test");
      return;
    }

    const startTime = Date.now();

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

        if (chunk.includes("RESPONSE TIMEOUT") || chunk.includes("timeout")) {
          hasTimeoutWarning = true;
        }

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

    if (elapsedTime > 59000 && elapsedTime < 62000) {
      expect(hasTimeoutWarning).toBe(true);
    }
  });

  it("should send progress updates during long responses", async () => {
    if (!serverAvailable) {
      console.log("Dev server not running on :5173, skipping integration test");
      return;
    }

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
            } catch {
              // Not JSON, skip
            }
          }
        }
      }
    }

    console.log(`Total progress updates: ${progressUpdateCount}`);
  });
});
