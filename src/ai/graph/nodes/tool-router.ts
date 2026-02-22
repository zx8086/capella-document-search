// src/ai/graph/nodes/tool-router.ts

import { HumanMessage } from "@langchain/core/messages";
import { log } from "$utils/unifiedLogger";
import { createBedrockChatModel } from "../../clients/bedrock-bearer-client";
import { toolsByName } from "../../tools";
import type { AgentStateType } from "../state";

const TOOL_ROUTING_PROMPT = `You are a routing classifier for a Couchbase database assistant. Analyze the user's question and determine if it requires real-time diagnostic tools or can be answered from document context alone.

REQUIRES TOOLS (respond "tools"):
- Questions about current cluster state, health, or status
- Questions about running queries, performance metrics, or system resources
- Questions asking to execute queries or check indexes
- Questions about what's happening right now in the database
- Any request that needs live data from the database cluster

NO TOOLS NEEDED (respond "knowledge"):
- Questions about concepts, best practices, or documentation
- Questions about how something works in general
- Questions that can be answered from retrieved document context
- Questions about company usage, case studies, or implementations
- Historical or explanatory questions

Examples:
- "Are my nodes healthy?" → tools
- "Show me slow queries" → tools
- "What indexes exist?" → tools
- "How does Tommy Hilfiger use Couchbase?" → knowledge
- "What is N1QL?" → knowledge
- "Explain query optimization" → knowledge

Respond with ONLY the word "tools" or "knowledge".`;

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

export async function toolRouterNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = extractQueryFromMessages(state.messages);

  if (!query) {
    log("[ToolRouter] No query found");
    return { selectedTools: [] };
  }

  const hasRagContext = !!(state.ragContext && state.ragContext.length > 0);

  try {
    // Use LLM to classify whether tools are needed
    const model = createBedrockChatModel({ temperature: 0, maxTokens: 10 });

    const response = await model.invoke([
      new HumanMessage(TOOL_ROUTING_PROMPT),
      new HumanMessage(`Query: "${query}"\nHas document context: ${hasRagContext}`),
    ]);

    const classification = (response.content as string).toLowerCase().trim();
    const needsTools = classification.includes("tools");

    log("[ToolRouter] LLM classification result", {
      query: query.substring(0, 50),
      classification,
      needsTools,
      hasRagContext,
    });

    if (!needsTools && hasRagContext) {
      // Knowledge question with RAG context - skip tools
      return { selectedTools: [] };
    }

    // Diagnostic question - provide all tools, let agent decide which to use
    const allToolNames = Object.keys(toolsByName);

    log("[ToolRouter] Providing tools to agent", {
      toolCount: allToolNames.length,
    });

    return { selectedTools: allToolNames };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    log("[ToolRouter] LLM classification failed, defaulting to tools", {
      error: errorMessage,
    });

    // On error, default to providing tools (safer option)
    return { selectedTools: Object.keys(toolsByName) };
  }
}

export function shouldUseTool(state: AgentStateType): "agent" | "responder" {
  // Only route to agent if we have specific tools selected that need execution
  // If no tools are selected, go directly to responder (uses RAG context if available)
  if (state.selectedTools.length > 0) {
    log("[ToolRouter] Routing to agent for tool execution", {
      selectedTools: state.selectedTools,
    });
    return "agent";
  }

  log("[ToolRouter] No tools selected, routing to responder", {
    hasRagContext: !!(state.ragContext && state.ragContext.length > 0),
  });
  return "responder";
}
