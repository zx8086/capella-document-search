// tests/ai/graph/nodes.test.ts

import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentStateType } from "$ai/graph/state";

// Mock state factory for testing
function createMockState(overrides: Partial<AgentStateType> = {}): AgentStateType {
  return {
    messages: [],
    ragContext: [],
    selectedTools: [],
    toolResults: [],
    recursionDepth: 0,
    queryClassification: "complex" as const,
    metadata: null,
    streamedResponse: "",
    error: null,
    ...overrides,
  };
}

describe("Classify Node", () => {
  describe("Pattern Matching", () => {
    it("should classify simple greetings as 'simple'", async () => {
      const { classifyNode } = await import("$ai/graph/nodes/classify");

      const simpleQueries = ["hi", "hello", "hey", "thanks", "thank you", "ok", "bye"];

      for (const query of simpleQueries) {
        const state = createMockState({
          messages: [new HumanMessage(query)],
        });

        const result = await classifyNode(state);
        expect(result.queryClassification).toBe("simple");
      }
    });

    it("should classify database queries as 'complex'", async () => {
      const { classifyNode } = await import("$ai/graph/nodes/classify");

      const complexQueries = [
        "show me slow queries",
        "check cluster health",
        "find expensive queries",
        "get system vitals",
        "analyze index performance",
      ];

      for (const query of complexQueries) {
        const state = createMockState({
          messages: [new HumanMessage(query)],
        });

        const result = await classifyNode(state);
        expect(result.queryClassification).toBe("complex");
      }
    });

    it("should handle empty queries as 'simple'", async () => {
      const { classifyNode } = await import("$ai/graph/nodes/classify");

      const state = createMockState({
        messages: [new HumanMessage("")],
      });

      const result = await classifyNode(state);
      expect(result.queryClassification).toBe("simple");
    });

    it("should handle very short queries as 'simple'", async () => {
      const { classifyNode } = await import("$ai/graph/nodes/classify");

      const state = createMockState({
        messages: [new HumanMessage("hi")],
      });

      const result = await classifyNode(state);
      expect(result.queryClassification).toBe("simple");
    });
  });
});

describe("Tool Router Node", () => {
  describe("Pattern Matching", () => {
    it("should select get_system_vitals for health queries", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("show me cluster health and vitals")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools).toContain("get_system_vitals");
    });

    it("should select query analysis tools for slow query requests", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("find slow running queries")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools).toContain("get_longest_running_queries");
    });

    it("should select multiple tools for complex queries", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("show me expensive and slow queries")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools?.length).toBeGreaterThanOrEqual(1);
    });

    it("should select fatal requests tool for error queries", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("show me fatal errors and timeouts")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools).toContain("get_fatal_requests");
    });

    it("should select index tools for index queries", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("list all indexes in the cluster")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools).toContain("get_system_indexes");
    });

    it("should default to general diagnostics for unmatched queries", async () => {
      const { toolRouterNode } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        messages: [new HumanMessage("tell me about the weather")],
      });

      const result = await toolRouterNode(state);
      expect(result.selectedTools).toBeDefined();
      expect(result.selectedTools?.length).toBeGreaterThan(0);
    });
  });

  describe("shouldUseTool Edge Function", () => {
    it("should route to agent for complex queries with tools", async () => {
      const { shouldUseTool } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        queryClassification: "complex",
        selectedTools: ["get_system_vitals"],
      });

      const result = shouldUseTool(state);
      expect(result).toBe("agent");
    });

    it("should route to responder for simple queries", async () => {
      const { shouldUseTool } = await import("$ai/graph/nodes/tool-router");

      const state = createMockState({
        queryClassification: "simple",
        selectedTools: [],
      });

      const result = shouldUseTool(state);
      expect(result).toBe("responder");
    });
  });
});

describe("Retriever Node", () => {
  describe("shouldRetrieve Edge Function", () => {
    it("should skip retrieval for simple queries", async () => {
      const { shouldRetrieve } = await import("$ai/graph/nodes/retriever");

      const state = createMockState({
        queryClassification: "simple",
        messages: [new HumanMessage("hello")],
      });

      const result = await shouldRetrieve(state);
      expect(result).toBe("skip");
    });

    it("should retrieve for complex queries", async () => {
      const { shouldRetrieve } = await import("$ai/graph/nodes/retriever");

      const state = createMockState({
        queryClassification: "complex",
        messages: [new HumanMessage("explain how couchbase replication works")],
      });

      const result = await shouldRetrieve(state);
      expect(result).toBe("retrieve");
    });

    it("should skip retrieval for empty queries", async () => {
      const { shouldRetrieve } = await import("$ai/graph/nodes/retriever");

      const state = createMockState({
        queryClassification: "complex",
        messages: [new HumanMessage("")],
      });

      const result = await shouldRetrieve(state);
      expect(result).toBe("skip");
    });

    it("should skip retrieval for very short queries", async () => {
      const { shouldRetrieve } = await import("$ai/graph/nodes/retriever");

      const state = createMockState({
        queryClassification: "complex",
        messages: [new HumanMessage("hi")],
      });

      const result = await shouldRetrieve(state);
      expect(result).toBe("skip");
    });
  });
});

describe("Agent Node", () => {
  describe("shouldContinue Edge Function", () => {
    it("should route to responder when there is an error", async () => {
      const { shouldContinue } = await import("$ai/graph/nodes/agent");

      const state = createMockState({
        error: "Something went wrong",
      });

      const result = shouldContinue(state);
      expect(result).toBe("responder");
    });

    it("should route to responder when no tool calls in last message", async () => {
      const { shouldContinue } = await import("$ai/graph/nodes/agent");

      const state = createMockState({
        messages: [new AIMessage("Here is your answer")],
      });

      const result = shouldContinue(state);
      expect(result).toBe("responder");
    });

    it("should route to tools when last message has tool calls", async () => {
      const { shouldContinue } = await import("$ai/graph/nodes/agent");

      const messageWithToolCall = new AIMessage({
        content: "",
        tool_calls: [{ name: "get_system_vitals", args: {}, id: "1", type: "tool_call" }],
      });

      const state = createMockState({
        messages: [messageWithToolCall],
      });

      const result = shouldContinue(state);
      expect(result).toBe("tools");
    });
  });

  describe("Recursion Depth", () => {
    it("should respect max recursion depth", async () => {
      const { agentNode } = await import("$ai/graph/nodes/agent");
      const { getMaxRecursionDepth } = await import("$ai/clients/bedrock-bearer-client");

      const maxDepth = getMaxRecursionDepth();
      const state = createMockState({
        recursionDepth: maxDepth,
        messages: [new HumanMessage("test")],
      });

      const result = await agentNode(state);
      expect(result.error).toContain("Max");
    });
  });
});
