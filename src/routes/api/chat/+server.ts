// src/routes/api/chat/+server.ts

import { type ChatRequest, streamAgent } from "$ai/graph/langgraph-agent";
import { dev } from "$app/environment";
import type { RAGMetadata } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import type { RequestHandler } from "./$types";

type ErrorCode =
  | "CONVERSATION_FORMAT"
  | "VALIDATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "RETRIEVAL"
  | "NETWORK"
  | "AUTH"
  | "FORBIDDEN"
  | "UNKNOWN";

function categorizeError(errorMessage: string): ErrorCode {
  if (/conversation must start with a user message/i.test(errorMessage))
    return "CONVERSATION_FORMAT";
  if (/ValidationException/i.test(errorMessage)) return "VALIDATION";
  if (/(throttled|rate limit)/i.test(errorMessage)) return "RATE_LIMIT";
  if (/(timeout|TimeoutError|ETIMEDOUT|ESOCKETTIMEDOUT)/i.test(errorMessage)) return "TIMEOUT";
  if (/(retrieval failed|pinecone|knowledge.?base|vector.?search)/i.test(errorMessage))
    return "RETRIEVAL";
  if (/(network|connection|ECONNREFUSED|ECONNRESET|socket hang up)/i.test(errorMessage))
    return "NETWORK";
  if (/(unauthorized|authentication)/i.test(errorMessage)) return "AUTH";
  if (/(forbidden|access denied)/i.test(errorMessage)) return "FORBIDDEN";
  return "UNKNOWN";
}

function getUserFriendlyErrorMessage(errorMessage: string): string {
  const code = categorizeError(errorMessage);

  const messages: Record<ErrorCode, string> = {
    CONVERSATION_FORMAT: "Please refresh the page and start a new conversation.",
    VALIDATION: "Please try rephrasing your question or starting a new conversation.",
    RATE_LIMIT: "Service is experiencing high demand. Please wait a moment and try again.",
    TIMEOUT:
      "The request timed out while searching the knowledge base. Please try a more specific question or try again shortly.",
    RETRIEVAL:
      "There was a problem searching the knowledge base. The service may be temporarily unavailable. Please try again in a moment.",
    NETWORK: "A network issue occurred while processing your request. Please try again.",
    AUTH: "Authentication failed. Please refresh the page and sign in again.",
    FORBIDDEN:
      "You don't have permission to perform this action. Please contact support if this persists.",
    UNKNOWN:
      "An unexpected error occurred while processing your request. Please try again, and if the problem persists, consider starting a new conversation.",
  };

  return messages[code];
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  log("[Server] Received chat request");

  if (request.signal?.aborted) {
    log("[Server] Request aborted before processing");
    return new Response(null, { status: 499 });
  }

  try {
    const requestBody = await request.json();
    const { message, messages, user } = requestBody;

    if (request.signal?.aborted) {
      log("[Server] Request aborted after parsing body");
      return new Response(null, { status: 499 });
    }

    // Extract current message from request
    const conversationMessages = messages || [];
    const currentMessage =
      message || conversationMessages[conversationMessages.length - 1]?.content || "";

    if (!currentMessage) {
      return new Response(JSON.stringify({ error: true, message: "No message provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate conversation/session IDs
    const conversationId = user?.conversationId || `conv-${user?.id || "anon"}-${Date.now()}`;
    const sessionId = user?.sessionId || `session-${user?.id || "anon"}-${Date.now()}`;

    // Prepare metadata for tracing
    const metadata: RAGMetadata = {
      userId: user?.id || "anonymous",
      userName: user?.name || "anonymous",
      userEmail: user?.email || "anonymous",
      tenantId: user?.tenantId || "unknown",
      isAuthenticated: user?.isAuthenticated || false,
      environment: dev ? "development" : "production",
      pathname: user?.pathname || "unknown",
      sessionStartTime: user?.sessionStartTime,
      messageCount: user?.messageCount || 1,
      sessionId,
      conversationId,
      clientTimestamp: user?.clientTimestamp,
      serverTimestamp: new Date().toISOString(),
      processingStartTime: startTime,
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
    };

    log("[Server] Processing chat request with LangGraph agent:", {
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
      conversationId,
      userId: user?.id,
    });

    // Prepare request for LangGraph agent
    const chatRequest: ChatRequest = {
      message: currentMessage,
      messages: conversationMessages,
      metadata,
    };

    // Stream response from LangGraph agent
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          try {
            // Send initial progress
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "progress",
                  message: "Starting to process your request...",
                  details: "Initializing LangGraph agent",
                  elapsedTime: 0,
                })}\n`
              )
            );

            // Stream from LangGraph agent
            for await (const chunk of streamAgent(chatRequest)) {
              if (request.signal?.aborted) {
                log("[Server] Request aborted during stream");
                controller.close();
                return;
              }
              controller.enqueue(encoder.encode(chunk));
            }

            controller.close();
            log("[Server] Stream completed successfully", {
              totalTime: Date.now() - startTime,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const elapsedMs = Date.now() - startTime;
            err("[Server] Stream error:", {
              error: errorMessage,
              stack: errorStack,
              elapsedMs,
              conversationId,
            });

            const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
            try {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    error: true,
                    content: userFriendlyError,
                    errorCode: categorizeError(errorMessage),
                    elapsedMs,
                  })}\n`
                )
              );
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    done: true,
                    error: true,
                  })}\n`
                )
              );
              controller.close();
            } catch (enqueueError) {
              // Stream already closed (e.g., client disconnected) - log but don't re-throw
              err("[Server] Failed to write error to stream (client likely disconnected)", {
                originalError: errorMessage,
                enqueueError:
                  enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
              });
            }
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Content-Type-Options": "nosniff",
          "X-Accel-Buffering": "no",
        },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    err("[Server] Error in chat API:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
    return new Response(JSON.stringify({ error: true, message: userFriendlyError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
