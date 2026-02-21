// src/ai/graph/state.ts

import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { RAGContext, RAGMetadata } from "$lib/rag/types";

export interface ToolResult {
  toolName: string;
  success: boolean;
  content: string;
  data?: Record<string, unknown>;
  executionTimeMs: number;
}

export const AgentState = Annotation.Root({
  // Core conversation messages (with built-in reducer for proper message handling)
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  // RAG context from vector search
  ragContext: Annotation<RAGContext[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // Selected tools from tool-router (deterministic selection)
  selectedTools: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // Tool execution results (accumulates across iterations)
  toolResults: Annotation<ToolResult[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),

  // Recursion control (replaces manual depth tracking)
  recursionDepth: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),

  // Query classification result
  queryClassification: Annotation<"simple" | "complex">({
    reducer: (_, y) => y,
    default: () => "complex" as const,
  }),

  // User metadata for tracing
  metadata: Annotation<RAGMetadata | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  // Accumulated streamed response
  streamedResponse: Annotation<string>({
    reducer: (x, y) => x + y,
    default: () => "",
  }),

  // Error state
  error: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
