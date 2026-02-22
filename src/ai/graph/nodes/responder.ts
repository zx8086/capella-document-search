// src/ai/graph/nodes/responder.ts

import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockChatModel } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

const SIMPLE_SYSTEM_PROMPT = `You are a friendly Couchbase database assistant. You help users with questions about Couchbase, database concepts, and can perform diagnostic analysis when needed.

For general questions, provide helpful and concise answers. If the user is asking about something that requires database analysis, let them know you can help with that and suggest what information you would need.`;

const KNOWLEDGE_SYSTEM_PROMPT = `You are an intelligent assistant with access to retrieved document context. Answer the user's question using the provided document context.

<response_guidelines>
1. Use the <document_context> to answer the user's question directly
2. Cite sources when referencing specific information (e.g., "According to [filename]...")
3. If the context doesn't fully answer the question, acknowledge what you found and what's missing
4. Be concise but thorough
5. Use markdown formatting for readability
</response_guidelines>`;

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
    // Check if the agent already produced a valid AI response (no tool calls)
    // If so, skip re-invoking the model to avoid duplicate/empty responses
    // IMPORTANT: Only use existing response if it's from the AI (not a HumanMessage)
    const lastMessage = state.messages[state.messages.length - 1];
    const isAIMessage =
      lastMessage &&
      // Check if it's an AI message by looking for the _getType method or checking class name
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((lastMessage as any)._getType?.() === "ai" ||
        lastMessage.constructor?.name === "AIMessage" ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (lastMessage as any).type === "ai");

    if (isAIMessage && lastMessage && "content" in lastMessage) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls = (lastMessage as any)?.tool_calls;
      const hasToolCalls = toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0;

      if (hasToolCalls) {
        // SAFETY CHECK: If we're in the responder but the last message has tool_calls,
        // this means tools were requested but not executed (shouldn't happen normally).
        // Extract any text content from the AI message, or return an error.
        log("[Responder] WARNING: Received AIMessage with tool_calls - tools were not executed", {
          toolCallCount: toolCalls.length,
        });

        const content = lastMessage.content;
        let textContent = "";

        if (typeof content === "string") {
          textContent = content;
        } else if (Array.isArray(content)) {
          textContent = content
            .map((block) => {
              if (typeof block === "string") return block;
              if (block.type === "text" && block.text) return block.text;
              return "";
            })
            .filter(Boolean)
            .join("");
        }

        // If there's text content alongside tool_calls, use it
        if (textContent.trim()) {
          return {
            streamedResponse: textContent,
          };
        }

        // No text content - return error message about tools not being executed
        return {
          streamedResponse:
            "I attempted to use diagnostic tools to answer your question, but encountered an issue. Please try your question again.",
          error: "Tools were requested but not executed",
        };
      }

      // No tool calls - agent already generated a final response
      const content = lastMessage.content;
      let textContent = "";

      if (typeof content === "string") {
        textContent = content;
      } else if (Array.isArray(content)) {
        textContent = content
          .map((block) => {
            if (typeof block === "string") return block;
            if (block.type === "text" && block.text) return block.text;
            return "";
          })
          .filter(Boolean)
          .join("");
      }

      if (textContent.trim()) {
        log("[Responder] Using agent's existing response, skipping redundant LLM call", {
          responseLength: textContent.length,
        });
        return {
          streamedResponse: textContent,
        };
      }
    }

    const isSimpleQuery = state.queryClassification === "simple";
    const hasToolResults = state.toolResults && state.toolResults.length > 0;
    const hasRagContext = state.ragContext && state.ragContext.length > 0;

    // Select appropriate system prompt based on query type and available context
    let systemPrompt: string;
    if (isSimpleQuery && !hasToolResults && !hasRagContext) {
      // Simple greeting or general question
      systemPrompt = SIMPLE_SYSTEM_PROMPT;
    } else if (hasToolResults) {
      // Diagnostic analysis with tool results
      systemPrompt = ANALYSIS_SYSTEM_PROMPT;
    } else if (hasRagContext) {
      // Knowledge question with document context
      systemPrompt = KNOWLEDGE_SYSTEM_PROMPT;
    } else {
      // Default to analysis prompt
      systemPrompt = ANALYSIS_SYSTEM_PROMPT;
    }

    const contextInfo = buildContextFromState(state);
    const fullSystemPrompt = contextInfo ? `${systemPrompt}\n\n${contextInfo}` : systemPrompt;

    const model = createBedrockChatModel({ temperature: 0.3 });

    const messages = [new SystemMessage(fullSystemPrompt), ...state.messages];

    log("[Responder] Generating final response with streaming", {
      isSimpleQuery,
      hasToolResults,
      hasRagContext,
      toolResultCount: state.toolResults?.length || 0,
      ragContextCount: state.ragContext?.length || 0,
      promptType: hasToolResults ? "analysis" : hasRagContext ? "knowledge" : "simple",
      messageCount: messages.length,
    });

    // Use streaming to emit on_llm_stream events for LangGraph streamEvents
    const stream = await model.stream(messages);

    // Accumulate the streamed response
    let textContent = "";
    let finalResponse: AIMessage | null = null;

    for await (const chunk of stream) {
      // Extract text from chunk content
      if (typeof chunk.content === "string") {
        textContent += chunk.content;
      } else if (Array.isArray(chunk.content)) {
        for (const block of chunk.content) {
          if (typeof block === "string") {
            textContent += block;
          } else if (block.type === "text" && block.text) {
            textContent += block.text;
          }
        }
      }
      // Keep track of the last chunk for metadata
      finalResponse = chunk;
    }

    log("[Responder] Response generated via streaming", {
      responseLength: textContent.length,
    });

    // Create a complete AIMessage with the full response
    const completeResponse = new AIMessage(textContent);

    return {
      messages: [completeResponse],
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
