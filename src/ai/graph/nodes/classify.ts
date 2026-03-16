// src/ai/graph/nodes/classify.ts

import { HumanMessage } from "@langchain/core/messages";
import { log } from "$utils/unifiedLogger";
import { createBedrockChatModel } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

const CLASSIFICATION_PROMPT = `You are a query classifier for a Couchbase database assistant. Classify the user's question as "simple" or "complex".

CRITICAL RULE: Any question about Couchbase, databases, N1QL, SQL++, NoSQL, documents, indexes, clusters, nodes, SDKs, or related technologies MUST be classified as "complex". These questions need RAG document retrieval to provide accurate, grounded answers.

1. "simple" - ONLY greetings, thanks, goodbyes, or meta-questions about the assistant itself
   Examples: "Hello", "What can you do?", "Thanks!", "Bye"

2. "complex" - ANY question seeking knowledge, information, or analysis. This includes:
   - Questions about Couchbase features, use cases, architecture, or benefits
   - Questions about database concepts, performance, or best practices
   - Questions requiring database tools or document retrieval
   - "Why", "How", "What is", "Explain", "Describe" questions about technical topics
   Examples: "Why use Couchbase?", "How does N1QL work?", "What are the benefits of NoSQL?", "Show me slow queries", "Check cluster health"

When in doubt, classify as "complex". It is better to retrieve documents unnecessarily than to miss relevant context.

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
    // Any Couchbase/database-related question should trigger RAG
    /\b(couchbase|capella|n1ql|sql\+\+|nosql|sdk|memcached|xdcr|eventing)\b/i,
    /\b(database|db|data\s*model|replication|partition|shard|vector\s*search)\b/i,
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
