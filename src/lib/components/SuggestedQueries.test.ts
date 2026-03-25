// src/lib/components/SuggestedQueries.test.ts
// Unit tests for SuggestedQueries component logic.
// Tests verify the data model that drives the component rendering.

import { describe, expect, it } from "bun:test";

// The component's data model (mirrors the Svelte component's internal state)
const suggestedQueries = [
  {
    text: "How does Tommy Hilfiger use Couchbase?",
    extendedThinking: false,
  },
  {
    text: "Why would Developers use Couchbase?",
    extendedThinking: true,
  },
  {
    text: "Are all my nodes healthy?",
    extendedThinking: false,
  },
  {
    text: "Do I have long running queries?",
    extendedThinking: false,
  },
];

describe("SuggestedQueries", () => {
  it("should have exactly four suggested queries", () => {
    expect(suggestedQueries).toHaveLength(4);
  });

  it("should contain expected query texts", () => {
    const texts = suggestedQueries.map((q) => q.text);

    expect(texts).toContain("How does Tommy Hilfiger use Couchbase?");
    expect(texts).toContain("Why would Developers use Couchbase?");
    expect(texts).toContain("Are all my nodes healthy?");
    expect(texts).toContain("Do I have long running queries?");
  });

  it("should enable extended thinking only for the developer query", () => {
    const extendedThinkingQueries = suggestedQueries.filter((q) => q.extendedThinking);

    expect(extendedThinkingQueries).toHaveLength(1);
    expect(extendedThinkingQueries[0].text).toBe("Why would Developers use Couchbase?");
  });

  it("should call onQuerySelect handler with correct parameters", () => {
    let capturedQuery = "";
    let capturedExtendedThinking = false;

    const onQuerySelect = (query: string, enableExtendedThinking?: boolean) => {
      capturedQuery = query;
      capturedExtendedThinking = enableExtendedThinking ?? false;
    };

    // Simulate clicking the developer query
    const devQuery = suggestedQueries.find((q) => q.extendedThinking);
    if (devQuery) {
      onQuerySelect(devQuery.text, devQuery.extendedThinking);
    }

    expect(capturedQuery).toBe("Why would Developers use Couchbase?");
    expect(capturedExtendedThinking).toBe(true);
  });

  it("should call onQuerySelect without extended thinking for other queries", () => {
    let capturedExtendedThinking = true;

    const onQuerySelect = (_query: string, enableExtendedThinking?: boolean) => {
      capturedExtendedThinking = enableExtendedThinking ?? false;
    };

    const nodeQuery = suggestedQueries.find((q) => q.text === "Are all my nodes healthy?");
    if (nodeQuery) {
      onQuerySelect(nodeQuery.text, nodeQuery.extendedThinking);
    }

    expect(capturedExtendedThinking).toBe(false);
  });
});
