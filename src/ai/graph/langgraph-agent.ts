// src/ai/graph/langgraph-agent.ts

import { HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import { traceable } from "langsmith/traceable";
import type { RAGContext, RAGMetadata } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import {
  agentNode,
  classifyNode,
  responderNode,
  retrieverNode,
  shouldContinue,
  shouldRetrieve,
  shouldUseTool,
  toolRouterNode,
  toolsNode,
} from "./nodes";
import { AgentState, type AgentStateType } from "./state";

// Build the graph
function buildGraph() {
  const workflow = new StateGraph(AgentState)
    // Add nodes
    .addNode("classify", classifyNode)
    .addNode("retriever", retrieverNode)
    .addNode("toolRouter", toolRouterNode)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)
    .addNode("responder", responderNode)

    // Entry point: classify the query
    .addEdge(START, "classify")

    // After classification, decide on retrieval
    .addConditionalEdges("classify", shouldRetrieve, {
      retrieve: "retriever",
      skip: "toolRouter",
    })

    // After retrieval, go to tool router
    .addEdge("retriever", "toolRouter")

    // After tool routing, decide on tool usage
    .addConditionalEdges("toolRouter", shouldUseTool, {
      agent: "agent",
      responder: "responder",
    })

    // After agent, decide to continue with tools or respond
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      responder: "responder",
    })

    // After tools execution, go back to agent
    .addEdge("tools", "agent")

    // Responder ends the workflow
    .addEdge("responder", END);

  return workflow.compile();
}

// Singleton compiled graph
let compiledGraph: ReturnType<typeof buildGraph> | null = null;

function getGraph() {
  if (!compiledGraph) {
    log("[LangGraph] Compiling agent graph");
    compiledGraph = buildGraph();
  }
  return compiledGraph;
}

export interface ChatRequest {
  message: string;
  messages?: { role: string; content: string }[];
  metadata?: RAGMetadata;
}

export interface ChatResponse {
  response: string;
  context: RAGContext[];
  toolResults: AgentStateType["toolResults"];
  metadata: {
    queryClassification: AgentStateType["queryClassification"];
    selectedTools: string[];
    executionTimeMs: number;
    error?: string;
  };
}

// Main entry point for the agent
export const runAgent = traceable(
  async (request: ChatRequest): Promise<ChatResponse> => {
    const startTime = Date.now();

    log("[LangGraph] Starting agent run", {
      messageLength: request.message.length,
      hasHistory: !!(request.messages && request.messages.length > 0),
      historyLength: request.messages?.length || 0,
    });

    try {
      const graph = getGraph();

      // Build initial messages
      // Only include user messages to avoid tool_use/tool_result pairing issues.
      // Assistant messages with tool_calls require corresponding ToolMessage responses,
      // but our chat store only saves simple text content, losing the tool call IDs.
      const initialMessages: HumanMessage[] = [];

      if (request.messages && request.messages.length > 0) {
        for (const msg of request.messages) {
          if (msg.role === "user") {
            initialMessages.push(new HumanMessage(msg.content));
          }
        }
      }

      // Only add request.message if it's not already the last user message
      // This prevents duplication when the frontend sends both messages array and message field
      const lastUserMsg = initialMessages[initialMessages.length - 1];
      const currentMsgContent = request.message?.trim();
      if (currentMsgContent && (!lastUserMsg || lastUserMsg.content !== currentMsgContent)) {
        initialMessages.push(new HumanMessage(currentMsgContent));
      }

      // Ensure we have at least one message
      if (initialMessages.length === 0 && request.message) {
        initialMessages.push(new HumanMessage(request.message));
      }

      // Initialize state
      const initialState: Partial<AgentStateType> = {
        messages: initialMessages,
        metadata: request.metadata || null,
      };

      // Run the graph
      const finalState = await graph.invoke(initialState);

      const executionTime = Date.now() - startTime;

      log("[LangGraph] Agent run complete", {
        executionTimeMs: executionTime,
        queryClassification: finalState.queryClassification,
        toolResultCount: finalState.toolResults?.length || 0,
        hasError: !!finalState.error,
      });

      // Extract final response from messages
      const lastMessage = finalState.messages[finalState.messages.length - 1];
      let responseText = "";

      if (lastMessage && "content" in lastMessage) {
        const content = lastMessage.content;
        if (typeof content === "string") {
          responseText = content;
        } else if (Array.isArray(content)) {
          responseText = content
            .map((block: { type?: string; text?: string } | string) => {
              if (typeof block === "string") return block;
              if (block.type === "text" && block.text) return block.text;
              return "";
            })
            .filter(Boolean)
            .join("");
        }
      }

      return {
        response: responseText || finalState.streamedResponse || "",
        context: finalState.ragContext || [],
        toolResults: finalState.toolResults || [],
        metadata: {
          queryClassification: finalState.queryClassification,
          selectedTools: finalState.selectedTools || [],
          executionTimeMs: executionTime,
          error: finalState.error || undefined,
        },
      };
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);

      err("[LangGraph] Agent run failed", {
        error: errorMessage,
        executionTimeMs: executionTime,
      });

      return {
        response: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
        context: [],
        toolResults: [],
        metadata: {
          queryClassification: "complex",
          selectedTools: [],
          executionTimeMs: executionTime,
          error: errorMessage,
        },
      };
    }
  },
  {
    name: "LangGraph Agent",
    run_type: "chain",
    tags: ["langgraph", "agent", "couchbase"],
  }
);

// Streaming version for SSE - format matches frontend ChatbotPopup expectations
export async function* streamAgent(request: ChatRequest): AsyncGenerator<string, void, unknown> {
  const startTime = Date.now();
  const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  log("[LangGraph] Starting streaming agent run", {
    messageLength: request.message.length,
    runId,
  });

  try {
    const graph = getGraph();

    // Build initial messages
    // Only include user messages to avoid tool_use/tool_result pairing issues
    const initialMessages: HumanMessage[] = [];

    if (request.messages && request.messages.length > 0) {
      for (const msg of request.messages) {
        if (msg.role === "user") {
          initialMessages.push(new HumanMessage(msg.content));
        }
      }
    }

    // Only add request.message if it's not already the last user message
    // This prevents duplication when the frontend sends both messages array and message field
    const lastUserMsg = initialMessages[initialMessages.length - 1];
    const currentMsgContent = request.message?.trim();
    if (currentMsgContent && (!lastUserMsg || lastUserMsg.content !== currentMsgContent)) {
      initialMessages.push(new HumanMessage(currentMsgContent));
    }

    // Ensure we have at least one message
    if (initialMessages.length === 0 && request.message) {
      initialMessages.push(new HumanMessage(request.message));
    }

    const initialState: Partial<AgentStateType> = {
      messages: initialMessages,
      metadata: request.metadata || null,
    };

    // Stream events from the graph
    const stream = await graph.streamEvents(initialState, {
      version: "v2",
    });

    let streamedContent = "";
    let hasStreamedContent = false;
    let finalResponseText = ""; // Track the final response for fallback

    for await (const event of stream) {
      // Emit node execution events as progress updates
      if (event.event === "on_chain_start" && event.name && event.name !== "LangGraph") {
        const nodeName = event.name;
        let progressMessage = "Processing...";

        if (nodeName === "classify") {
          progressMessage = "Analyzing your question...";
        } else if (nodeName === "retriever") {
          progressMessage = "Searching knowledge base...";
        } else if (nodeName === "toolRouter") {
          progressMessage = "Determining best approach...";
        } else if (nodeName === "agent") {
          progressMessage = "Reasoning about your question...";
        } else if (nodeName === "responder") {
          progressMessage = "Generating response...";
        }

        yield `${JSON.stringify({
          type: "progress",
          message: progressMessage,
          details: `Running ${nodeName}`,
          nodeName,
        })}\n`;
      }

      // Emit tool execution events as progress updates
      if (event.event === "on_tool_start") {
        yield `${JSON.stringify({
          type: "progress",
          message: `Executing ${event.name}...`,
          details: "Running tool",
          activeToolName: event.name,
          isExecutingTools: true,
        })}\n`;
      }

      if (event.event === "on_tool_end") {
        yield `${JSON.stringify({
          type: "progress",
          message: `Completed ${event.name}`,
          details: "Tool finished",
          activeToolName: null,
          isExecutingTools: false,
        })}\n`;
      }

      // Emit LLM token events for streaming text (frontend expects { content: "..." })
      if (event.event === "on_llm_stream" && event.data?.chunk) {
        const rawContent = event.data.chunk.content;
        let textContent = "";

        if (typeof rawContent === "string") {
          textContent = rawContent;
        } else if (Array.isArray(rawContent)) {
          textContent = rawContent
            .map((block: { type?: string; text?: string } | string) => {
              if (typeof block === "string") return block;
              if (block.type === "text" && block.text) return block.text;
              return "";
            })
            .filter(Boolean)
            .join("");
        }

        if (textContent) {
          streamedContent += textContent;
          hasStreamedContent = true;
          yield `${JSON.stringify({
            content: textContent,
          })}\n`;
        }
      }

      // Log all on_chain_end events to understand the event flow
      if (event.event === "on_chain_end") {
        log("[LangGraph] on_chain_end event received", {
          name: event.name,
          hasData: !!event.data,
          hasOutput: !!event.data?.output,
          isLangGraph: event.name === "LangGraph",
        });
      }

      // Capture final state from graph completion to handle non-streamed responses
      if (event.event === "on_chain_end" && event.name === "LangGraph") {
        const output = event.data?.output;
        log("[LangGraph] Processing LangGraph on_chain_end", {
          hasOutput: !!output,
          hasStreamedContent,
          streamedContentLength: streamedContent.length,
          outputKeys: output ? Object.keys(output) : [],
          streamedResponseValue: output?.streamedResponse?.substring?.(0, 100) || "N/A",
        });

        if (output) {
          // Try multiple sources for the response
          let finalText = "";
          let source = "none";

          // First, check streamedResponse from state (set by responder)
          if (output.streamedResponse && typeof output.streamedResponse === "string") {
            finalText = output.streamedResponse;
            source = "streamedResponse";
          }

          // Fallback to last message content if streamedResponse is empty
          if (!finalText) {
            const messages = output.messages || [];
            const lastMessage = messages[messages.length - 1];
            log("[LangGraph] Checking last message for content", {
              messageCount: messages.length,
              hasLastMessage: !!lastMessage,
              lastMessageType: lastMessage?.constructor?.name,
            });

            if (lastMessage && "content" in lastMessage) {
              const content = lastMessage.content;
              if (typeof content === "string") {
                finalText = content;
                source = "lastMessage-string";
              } else if (Array.isArray(content)) {
                finalText = content
                  .map((block: { type?: string; text?: string } | string) => {
                    if (typeof block === "string") return block;
                    if (block.type === "text" && block.text) return block.text;
                    return "";
                  })
                  .filter(Boolean)
                  .join("");
                source = "lastMessage-array";
              }
            }
          }

          log("[LangGraph] Final text extraction result", {
            finalTextLength: finalText.length,
            source,
            willEmit: finalText && finalText !== streamedContent && !hasStreamedContent,
          });

          // Only emit if we have content that wasn't already streamed
          if (finalText && finalText !== streamedContent && !hasStreamedContent) {
            log("[LangGraph] Emitting non-streamed response from final state", {
              responseLength: finalText.length,
              source,
            });
            finalResponseText = finalText; // Track for done event fallback
            yield `${JSON.stringify({
              content: finalText,
            })}\n`;
          }

          // Always track the final response text for the done event
          if (finalText && !finalResponseText) {
            finalResponseText = finalText;
          }
        }
      }
    }

    // Track streamed content as final response if it wasn't captured from on_chain_end
    if (streamedContent && !finalResponseText) {
      finalResponseText = streamedContent;
    }

    // Final completion event with fallback response
    // Include finalResponse as a fallback in case content events weren't processed
    yield `${JSON.stringify({
      done: true,
      runId,
      executionTimeMs: Date.now() - startTime,
      finalResponse: finalResponseText || undefined,
    })}\n`;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    err("[LangGraph] Streaming agent failed", { error: errorMessage });

    // Error format (frontend expects { error: true, content: "..." })
    yield `${JSON.stringify({
      error: true,
      content: errorMessage,
      executionTimeMs: Date.now() - startTime,
    })}\n`;
  }
}

// Export graph for testing and debugging
export { getGraph, buildGraph };
