// tests/ai/graph/state.test.ts

import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { AgentState, type AgentStateType, type ToolResult } from "$ai/graph/state";

describe("AgentState", () => {
  describe("State Type", () => {
    it("should be a valid LangGraph Annotation", () => {
      expect(AgentState).toBeDefined();
      // AgentState is an Annotation.Root object containing channel definitions
      expect(typeof AgentState).toBe("object");
      expect(AgentState.spec).toBeDefined();
    });

    it("should have all required fields in State type", () => {
      // Verify the type includes expected fields
      const dummyState: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      expect(dummyState.messages).toBeDefined();
      expect(dummyState.ragContext).toBeDefined();
      expect(dummyState.selectedTools).toBeDefined();
      expect(dummyState.toolResults).toBeDefined();
      expect(dummyState.recursionDepth).toBeDefined();
      expect(dummyState.queryClassification).toBeDefined();
      expect(dummyState.metadata).toBeDefined();
      expect(dummyState.streamedResponse).toBeDefined();
      expect(dummyState.error).toBeDefined();
    });
  });

  describe("State Field Values", () => {
    it("messages should accept BaseMessage array", () => {
      const state: AgentStateType = {
        messages: [new HumanMessage("Hello"), new AIMessage("Hi there!")],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe("Hello");
    });

    it("queryClassification should accept 'simple' or 'complex'", () => {
      const simpleState: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "simple",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      const complexState: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      expect(simpleState.queryClassification).toBe("simple");
      expect(complexState.queryClassification).toBe("complex");
    });

    it("selectedTools should accept string array", () => {
      const state: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: ["get_system_vitals", "get_system_nodes"],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      expect(state.selectedTools).toHaveLength(2);
      expect(state.selectedTools).toContain("get_system_vitals");
    });

    it("error should accept string or null", () => {
      const errorState: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: "Something went wrong",
      };

      const noErrorState: AgentStateType = {
        messages: [],
        ragContext: [],
        selectedTools: [],
        toolResults: [],
        recursionDepth: 0,
        queryClassification: "complex",
        metadata: null,
        streamedResponse: "",
        error: null,
      };

      expect(errorState.error).toBe("Something went wrong");
      expect(noErrorState.error).toBeNull();
    });
  });
});

describe("ToolResult Type", () => {
  it("should have required properties", () => {
    const toolResult: ToolResult = {
      toolName: "get_system_vitals",
      success: true,
      content: "System is healthy",
      executionTimeMs: 150,
    };

    expect(toolResult.toolName).toBe("get_system_vitals");
    expect(toolResult.success).toBe(true);
    expect(toolResult.content).toBe("System is healthy");
    expect(toolResult.executionTimeMs).toBe(150);
  });

  it("should allow optional data property", () => {
    const toolResult: ToolResult = {
      toolName: "get_system_vitals",
      success: true,
      content: "System is healthy",
      executionTimeMs: 150,
      data: { cpu: 50, memory: 60 },
    };

    expect(toolResult.data).toEqual({ cpu: 50, memory: 60 });
  });

  it("should work without data property", () => {
    const toolResult: ToolResult = {
      toolName: "get_fatal_requests",
      success: false,
      content: "No data found",
      executionTimeMs: 50,
    };

    expect(toolResult.data).toBeUndefined();
    expect(toolResult.success).toBe(false);
  });

  it("should store tool results in state", () => {
    const toolResults: ToolResult[] = [
      {
        toolName: "get_system_vitals",
        success: true,
        content: "CPU: 50%, Memory: 60%",
        executionTimeMs: 100,
      },
      {
        toolName: "get_system_nodes",
        success: true,
        content: "3 nodes active",
        executionTimeMs: 75,
      },
    ];

    const state: AgentStateType = {
      messages: [],
      ragContext: [],
      selectedTools: [],
      toolResults,
      recursionDepth: 0,
      queryClassification: "complex",
      metadata: null,
      streamedResponse: "",
      error: null,
    };

    expect(state.toolResults).toHaveLength(2);
    expect(state.toolResults[0].toolName).toBe("get_system_vitals");
    expect(state.toolResults[1].toolName).toBe("get_system_nodes");
  });
});
