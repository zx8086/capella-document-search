// src/ai/graph/nodes/agent.ts

import { SystemMessage } from "@langchain/core/messages";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockChatModel, getMaxRecursionDepth } from "../../clients/bedrock-bearer-client";
import { allTools } from "../../tools";
import type { AgentStateType } from "../state";

const SYSTEM_PROMPT = `You are an intelligent assistant with access to real-time Couchbase diagnostic tools and retrieved document context.

<role>
You help users by:
1. Answering questions using retrieved document context when available
2. Executing diagnostic tools to analyze Couchbase clusters
3. Providing insights based on both documents and tool results
</role>

<context_usage_rules>
1. When <retrieved_context> is provided, USE IT to answer the user's question
2. Cite sources from the retrieved context (e.g., "According to [filename]...")
3. If the retrieved context answers the question, you do NOT need to call tools
4. Only use tools when the question requires real-time cluster diagnostics
</context_usage_rules>

<tool_execution_rules>
1. Use tools for real-time data like cluster health, query performance, and system metrics
2. NEVER simulate or fabricate tool results
3. After executing a tool, analyze the results and provide actionable insights
4. You may call multiple tools if needed to fully answer the question
</tool_execution_rules>

<response_format>
- Answer the question directly using available context first
- Summarize findings clearly and concisely
- Cite document sources when using retrieved context
- Highlight any issues or concerns
- Provide specific recommendations when applicable
- Use markdown formatting for readability
</response_format>

<thinking_format>
Before answering, wrap your reasoning process in <thinking></thinking> tags. This helps users understand your thought process.
Include: what you understood from the question, what information you're using (tools/context), and how you arrived at your answer.
Keep the thinking concise but informative.
</thinking_format>`;

function filterToolsBySelection(selectedTools: string[]) {
  if (!selectedTools || selectedTools.length === 0) {
    return allTools;
  }
  return allTools.filter((tool) => selectedTools.includes(tool.name));
}

function buildContextMessages(state: AgentStateType): string {
  const contextParts: string[] = [];

  // Add RAG context if available
  if (state.ragContext && state.ragContext.length > 0) {
    const ragText = state.ragContext
      .map(
        (ctx) =>
          `[Source: ${ctx.filename}${ctx.pageNumber ? ` p.${ctx.pageNumber}` : ""}]\n${ctx.text}`
      )
      .join("\n\n---\n\n");
    contextParts.push(`<retrieved_context>\n${ragText}\n</retrieved_context>`);
  }

  // Add tool results if available
  if (state.toolResults && state.toolResults.length > 0) {
    const toolResultsText = state.toolResults
      .map(
        (result) =>
          `[Tool: ${result.toolName}] ${result.success ? "Success" : "Failed"}\n${result.content}`
      )
      .join("\n\n");
    contextParts.push(`<previous_tool_results>\n${toolResultsText}\n</previous_tool_results>`);
  }

  return contextParts.join("\n\n");
}

export async function agentNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const maxDepth = getMaxRecursionDepth();

  if (state.recursionDepth >= maxDepth) {
    log("[Agent] Max recursion depth reached", {
      depth: state.recursionDepth,
      maxDepth,
    });
    return {
      error: `Max tool recursion depth (${maxDepth}) reached. Please simplify your request.`,
    };
  }

  try {
    const model = createBedrockChatModel({ temperature: 0.3 });

    // Filter tools based on selection
    const availableTools = filterToolsBySelection(state.selectedTools);

    // Bind tools to model
    const modelWithTools = model.bindTools(availableTools);

    // Build messages
    const contextInfo = buildContextMessages(state);
    const systemContent = contextInfo ? `${SYSTEM_PROMPT}\n\n${contextInfo}` : SYSTEM_PROMPT;

    const messages = [new SystemMessage(systemContent), ...state.messages];

    log("[Agent] Invoking model with tools", {
      toolCount: availableTools.length,
      messageCount: messages.length,
      recursionDepth: state.recursionDepth,
      hasRagContext: !!(state.ragContext && state.ragContext.length > 0),
      ragContextCount: state.ragContext?.length || 0,
    });

    const response = await modelWithTools.invoke(messages);

    log("[Agent] Model response received", {
      hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0),
      toolCallCount: response.tool_calls?.length || 0,
    });

    return {
      messages: [response],
      recursionDepth: state.recursionDepth + 1,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    err("[Agent] Error invoking model", { error: errorMessage });
    return {
      error: `Agent error: ${errorMessage}`,
    };
  }
}

export function shouldContinue(state: AgentStateType): "tools" | "responder" {
  // Check the last message for tool calls FIRST - tool calls take priority
  // Even if there was an earlier error (e.g., retrieval failed), we should still
  // execute tools if the agent requested them
  const lastMessage = state.messages[state.messages.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCalls = (lastMessage as any)?.tool_calls;
  if (lastMessage && toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    log("[Agent] Tool calls detected, routing to tools node", {
      toolCallCount: toolCalls.length,
      hasError: !!state.error,
    });
    return "tools";
  }

  // No tool calls - route to responder
  log("[Agent] No tool calls, routing to responder", {
    hasError: !!state.error,
  });
  return "responder";
}
