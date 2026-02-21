// src/ai/graph/nodes/responder.ts

import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockChatModel } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

const SIMPLE_SYSTEM_PROMPT = `You are a friendly Couchbase database assistant. You help users with questions about Couchbase, database concepts, and can perform diagnostic analysis when needed.

For general questions, provide helpful and concise answers. If the user is asking about something that requires database analysis, let them know you can help with that and suggest what information you would need.`;

const ANALYSIS_SYSTEM_PROMPT = `You are a Couchbase database analyst. Based on the tool results and context provided, synthesize a clear and actionable response for the user.

<response_guidelines>
1. Summarize key findings from tool executions
2. Highlight any issues, warnings, or concerns
3. Provide specific recommendations when applicable
4. Use clear markdown formatting for readability
5. If multiple tools were used, organize findings logically
6. Include relevant metrics and statistics
</response_guidelines>`;

function buildContextFromState(state: AgentStateType): string {
  const contextParts: string[] = [];

  // Add RAG context if available
  if (state.ragContext && state.ragContext.length > 0) {
    const ragText = state.ragContext
      .map(
        (ctx) =>
          `[Source: ${ctx.filename}${ctx.pageNumber ? ` p.${ctx.pageNumber}` : ""}]\n${ctx.text}`
      )
      .join("\n\n---\n\n");
    contextParts.push(`<document_context>\n${ragText}\n</document_context>`);
  }

  // Add tool results summary
  if (state.toolResults && state.toolResults.length > 0) {
    const successfulTools = state.toolResults.filter((r) => r.success);
    const failedTools = state.toolResults.filter((r) => !r.success);

    let toolSummary = `<tool_results_summary>
Executed ${state.toolResults.length} tool(s): ${successfulTools.length} successful, ${failedTools.length} failed`;

    if (failedTools.length > 0) {
      toolSummary += `\nFailed tools: ${failedTools.map((t) => t.toolName).join(", ")}`;
    }

    toolSummary += `\n</tool_results_summary>`;
    contextParts.push(toolSummary);
  }

  // Add error information if present
  if (state.error) {
    contextParts.push(`<error>\n${state.error}\n</error>`);
  }

  return contextParts.join("\n\n");
}

export async function responderNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  try {
    const isSimpleQuery = state.queryClassification === "simple";
    const hasToolResults = state.toolResults && state.toolResults.length > 0;

    // For simple queries without tool results, use simple prompt
    const systemPrompt =
      isSimpleQuery && !hasToolResults ? SIMPLE_SYSTEM_PROMPT : ANALYSIS_SYSTEM_PROMPT;

    const contextInfo = buildContextFromState(state);
    const fullSystemPrompt = contextInfo ? `${systemPrompt}\n\n${contextInfo}` : systemPrompt;

    const model = createBedrockChatModel({ temperature: 0.3 });

    const messages = [new SystemMessage(fullSystemPrompt), ...state.messages];

    log("[Responder] Generating final response", {
      isSimpleQuery,
      hasToolResults,
      toolResultCount: state.toolResults?.length || 0,
      messageCount: messages.length,
    });

    const response = await model.invoke(messages);

    // Extract text content from various response formats
    let textContent = "";
    if (typeof response.content === "string") {
      textContent = response.content;
    } else if (Array.isArray(response.content)) {
      textContent = response.content
        .map((block) => {
          if (typeof block === "string") return block;
          if (block.type === "text" && block.text) return block.text;
          return "";
        })
        .filter(Boolean)
        .join("");
    }

    log("[Responder] Response generated", {
      responseLength: textContent.length,
      contentType: typeof response.content,
      isArray: Array.isArray(response.content),
    });

    return {
      messages: [response],
      streamedResponse: textContent,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    err("[Responder] Error generating response", { error: errorMsg });

    const errorMessage = new AIMessage(
      `I apologize, but I encountered an error while generating a response: ${errorMsg}. Please try again.`
    );

    return {
      messages: [errorMessage],
      error: errorMsg,
    };
  }
}
