// src/ai/graph/nodes/agent.ts

import { SystemMessage } from "@langchain/core/messages";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockChatModel, getMaxRecursionDepth } from "../../clients/bedrock-bearer-client";
import { allTools } from "../../tools";
import type { AgentStateType } from "../state";

const SYSTEM_PROMPT = `You are a Couchbase database analyst with access to real-time diagnostic tools.

<role>
You help users understand and optimize their Couchbase clusters by executing diagnostic tools and analyzing the results.
</role>

<tool_execution_rules>
1. ALWAYS use tools to retrieve actual data - NEVER simulate or fabricate results
2. When a user asks about cluster health, queries, or performance, you MUST execute the appropriate tool
3. After executing a tool, analyze the results and provide actionable insights
4. If a tool returns no data, explain what that means and suggest alternatives
5. You may call multiple tools if needed to fully answer the question
</tool_execution_rules>

<response_format>
- Summarize findings clearly and concisely
- Highlight any issues or concerns
- Provide specific recommendations when applicable
- Use markdown formatting for readability
</response_format>`;

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
  // Check for errors
  if (state.error) {
    return "responder";
  }

  // Check the last message for tool calls
  const lastMessage = state.messages[state.messages.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCalls = (lastMessage as any)?.tool_calls;
  if (lastMessage && toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    log("[Agent] Tool calls detected, routing to tools node");
    return "tools";
  }

  log("[Agent] No tool calls, routing to responder");
  return "responder";
}
