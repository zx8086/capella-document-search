// src/routes/api/chat/+server.ts

import { type ChatRequest, streamAgent } from "$ai/graph/langgraph-agent";
import { dev } from "$app/environment";
import type { RAGMetadata } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import type { RequestHandler } from "./$types";

function getUserFriendlyErrorMessage(errorMessage: string): string {
  const errorPatterns = [
    {
      pattern: /conversation must start with a user message/i,
      message: "Please refresh the page and start a new conversation.",
    },
    {
      pattern: /ValidationException/i,
      message: "Please try rephrasing your question or starting a new conversation.",
    },
    {
      pattern: /(throttled|rate limit)/i,
      message: "Service is experiencing high demand. Please wait a moment and try again.",
    },
    {
      pattern: /(timeout|TimeoutError)/i,
      message: "Request timed out. Please try again with a shorter message.",
    },
    {
      pattern: /(network|connection)/i,
      message: "Network connectivity issue. Please check your connection and try again.",
    },
    {
      pattern: /(unauthorized|authentication)/i,
      message: "Authentication failed. Please refresh the page and sign in again.",
    },
    {
      pattern: /(forbidden|access denied)/i,
      message:
        "You don't have permission to perform this action. Please contact support if this persists.",
    },
  ];

  for (const { pattern, message } of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return message;
    }
  }

  return "I apologize, but I encountered an unexpected error. Please try again, and if the problem persists, consider starting a new conversation.";
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
            err("[Server] Stream error:", { error: errorMessage });

            const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  error: true,
                  content: userFriendlyError,
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
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
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
