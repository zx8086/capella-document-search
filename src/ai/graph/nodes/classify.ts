// src/ai/graph/nodes/classify.ts

import { HumanMessage } from "@langchain/core/messages";
import { log } from "$utils/unifiedLogger";
import { createBedrockChatModel } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

const CLASSIFICATION_PROMPT = `You are a query classifier for a Couchbase database assistant. Analyze the user's question and determine if it's:

1. "simple" - A greeting, general question, or simple clarification that doesn't require database tools or RAG retrieval
   Examples: "Hello", "What can you do?", "Thanks!", "Can you explain what N1QL is?"

2. "complex" - A question that requires database analysis tools OR document retrieval
   Examples: "Show me slow queries", "Check cluster health", "Find documents about pricing", "What indexes need optimization?"

Respond with ONLY the word "simple" or "complex".`;

function extractQueryFromMessages(messages: AgentStateType["messages"]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && "content" in lastMessage) {
    const content = lastMessage.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === "string" ? c : c.text || "")).join(" ");
    }
  }
  return "";
}

export async function classifyNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = extractQueryFromMessages(state.messages);

  if (!query || query.length < 3) {
    log("[Classify] Empty or very short query, defaulting to simple");
    return { queryClassification: "simple" };
  }

  // Quick heuristics for obvious cases
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|bye|goodbye)[\s!.]*$/i,
    /^what (can|do) you do\??$/i,
    /^help[\s!.]*$/i,
  ];

  const complexPatterns = [
    /\b(show|list|get|find|check|analyze|query|search|retrieve)\b/i,
    /\b(slow|expensive|fatal|error|index|cluster|node|vital|performance)\b/i,
    /\b(queries|statements|documents|schema|collection|bucket|scope)\b/i,
  ];

  // Fast path for simple queries
  if (simplePatterns.some((p) => p.test(query))) {
    log("[Classify] Simple query detected via pattern matching");
    return { queryClassification: "simple" };
  }

  // Fast path for complex queries
  if (complexPatterns.some((p) => p.test(query))) {
    log("[Classify] Complex query detected via pattern matching");
    return { queryClassification: "complex" };
  }

  // For ambiguous cases, use the LLM
  try {
    const model = createBedrockChatModel({ temperature: 0, maxTokens: 10 });

    const response = await model.invoke([
      new HumanMessage(CLASSIFICATION_PROMPT),
      new HumanMessage(`Query: "${query}"`),
    ]);

    const classification = (response.content as string).toLowerCase().trim().includes("simple")
      ? "simple"
      : "complex";

    log("[Classify] LLM classification result", {
      query: query.substring(0, 50),
      classification,
    });

    return { queryClassification: classification };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log("[Classify] LLM classification failed, defaulting to complex", {
      error: errorMessage,
    });
    return { queryClassification: "complex" };
  }
}
