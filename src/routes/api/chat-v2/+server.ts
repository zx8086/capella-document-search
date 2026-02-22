// src/routes/api/chat-v2/+server.ts

import { json, type RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { RAGMetadata } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import { type ChatRequest, runAgent, streamAgent } from "../../../ai";

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

export const POST = async ({ request }: RequestEvent) => {
  const startTime = Date.now();
  log("[ChatV2] Received request");

  if (request.signal?.aborted) {
    log("[ChatV2] Request aborted before processing");
    return new Response(null, { status: 499 });
  }

  try {
    const requestBody = await request.json();
    const { message, messages, user, stream: useStreaming = false } = requestBody;

    if (request.signal?.aborted) {
      log("[ChatV2] Request aborted after parsing body");
      return new Response(null, { status: 499 });
    }

    const conversationId = user?.conversationId || `conv-${user?.id || "anon"}-${Date.now()}`;
    const sessionId = user?.sessionId || `session-${user?.id || "anon"}-${Date.now()}`;

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
      messageLength: message?.length || 0,
    };

    log("[ChatV2] Processing chat request", {
      messageLength: message?.length || 0,
      messagesCount: messages?.length || 0,
      conversationId,
      userId: user?.id,
      useStreaming,
    });

    const chatRequest: ChatRequest = {
      message: message || messages?.[messages.length - 1]?.content || "",
      messages: messages || [],
      metadata,
    };

    if (useStreaming) {
      // Streaming response
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              const encoder = new TextEncoder();

              // Send initial progress
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    type: "progress",
                    message: "Starting to process your request...",
                  })}\n`
                )
              );

              for await (const event of streamAgent(chatRequest)) {
                if (request.signal?.aborted) {
                  log("[ChatV2] Stream aborted by client");
                  break;
                }
                controller.enqueue(encoder.encode(event));
              }

              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    type: "done",
                    executionTimeMs: Date.now() - startTime,
                  })}\n`
                )
              );

              controller.close();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              err("[ChatV2] Streaming error", { error: errorMessage });

              try {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      type: "error",
                      error: getUserFriendlyErrorMessage(errorMessage),
                    })}\n`
                  )
                );
                controller.close();
              } catch {
                controller.error(error);
              }
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
    }

    // Non-streaming response
    const result = await runAgent(chatRequest);

    log("[ChatV2] Request completed", {
      executionTimeMs: result.metadata.executionTimeMs,
      queryClassification: result.metadata.queryClassification,
      toolCount: result.toolResults.length,
      contextCount: result.context.length,
    });

    return json({
      response: result.response,
      context: result.context,
      metadata: {
        ...result.metadata,
        conversationId,
        sessionId,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    err("[ChatV2] Error in chat API", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return json(
      {
        error: true,
        message: getUserFriendlyErrorMessage(errorMessage),
      },
      { status: 500 }
    );
  }
};
