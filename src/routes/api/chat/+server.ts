/* src/routes/api/chat/+server.ts */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createRAGProvider } from "$lib/rag/factory";
import type { RAGMetadata } from "$lib/rag/types";
import { verifyRAGSetup } from "$lib/rag/verify";
import { BedrockChatService } from "$lib/services/bedrock-chat";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../../backend-config";
import { log, err } from "$utils/unifiedLogger";
import { dev } from "$app/environment";

// Initialize provider lazily
let ragProvider: any = null;
let chatService: BedrockChatService | null = null;

// Force reset chat service for debugging
chatService = null;

export const POST: RequestHandler = async ({ fetch, request }) => {
  const startTime = Date.now();
  log("📥 [Server] Received request");

  // Note: Only reset if needed to debug, but we want to maintain instance continuity
  // chatService = null;

  try {
    // Initialize provider with fetch
    if (!ragProvider) {
      log("🌟 [Server] Starting RAG system initialization");
      ragProvider = createRAGProvider(fetch);
      log("⚙️ [Server] Provider instance created:", {
        type: ragProvider.constructor.name,
      });

      await ragProvider.initialize();
      log("✅ [Server] RAG system initialized:", {
        provider: Bun.env.RAG_PIPELINE,
        timestamp: new Date().toISOString(),
      });
    }

    const requestBody = await request.json();
    const { message, messages, user } = requestBody;
    
    // Handle both old single message format and new messages array format
    const conversationMessages = messages || (message ? [{ role: 'user', content: message }] : []);
    const currentMessage = conversationMessages[conversationMessages.length - 1]?.content || message || '';

    // Initialize chat service using global connection approach
    if (!chatService) {
      log("🌟 [Server] Creating chat service with global connection approach");
      chatService = new BedrockChatService("eu-central-1");
      log("✅ [Server] Chat service created (will use global connection for tools)");
    } else {
      log("♻️ [Server] Using existing chat service instance");
    }

    log("📨 [Server] Processing chat request:", {
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
      conversationId: user?.conversationId,
      userId: user?.id,
      provider: Bun.env.RAG_PIPELINE,
      timestamp: new Date().toISOString(),
    });

    log("🔍 Server received user data:", {
      userId: user?.id || "anonymous",
      userName: user?.name || "anonymous", 
      userEmail: user?.email || "anonymous"
    });

    // Prepare metadata for tracing
    const metadata: RAGMetadata = {
      // User Information
      userId: user?.id || "anonymous",
      userName: user?.name || "anonymous",
      userEmail: user?.email || "anonymous",
      tenantId: user?.tenantId || "unknown",
      isAuthenticated: user?.isAuthenticated || false,

      // Environment & Context
      environment: dev ? "development" : "production",
      pathname: user?.pathname || "unknown",

      // Session Information
      sessionStartTime: user?.sessionStartTime,
      messageCount: user?.messageCount || 1,

      // Request Details
      clientTimestamp: user?.clientTimestamp,
      serverTimestamp: new Date().toISOString(),

      // Performance Metrics
      processingStartTime: startTime,

      // Message Details
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
      conversationId: user?.conversationId,
    };

    log("🔄 [Server] Executing RAG query with conversation context:", {
      messagesCount: conversationMessages.length,
      currentQuery: currentMessage.substring(0, 100) + (currentMessage.length > 100 ? '...' : ''),
      fullConversation: conversationMessages.map((msg, i) => `${i+1}. ${msg.role}: ${msg.content.substring(0, 80)}...`)
    });
    
    // For now, we use the current message for RAG retrieval
    // Future enhancement: could combine recent messages for better context retrieval
    const { stream, context } = await ragProvider.query(currentMessage, metadata);

    log("✅ [Server] Query completed:", {
      contextSize: context?.length || 0,
      processingTime: Date.now() - startTime,
      provider: Bun.env.RAG_PIPELINE,
      sourceFiles: context?.map((c) => c.filename).join(", "),
    });

    // Log context metrics
    log("📊 Query Context:", {
      contextSize: context?.length || 0,
      sourceFiles: context?.map((c) => c.filename).join(", "),
    });

    // Debug: Log full context to see available metadata
    if (context && context.length > 0) {
      log("🔍 [Debug] Context metadata:", {
        firstContext: {
          filename: context[0].filename,
          pageNumber: context[0].pageNumber,
          chunkIndex: context[0].chunkIndex,
          hasMetadata: !!context[0].metadata,
          metadataKeys: context[0].metadata
            ? Object.keys(context[0].metadata)
            : [],
        },
      });
    }

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            let fullResponse = "";

            log("🌊 [Server] Starting to read stream with conversation context");
            let chunkCount = 0;
            
            // If using AWS Knowledge Base (which uses Bedrock) and we have conversation history, use conversation mode
            if (Bun.env.RAG_PIPELINE === 'AWS_KNOWLEDGE_BASE' && conversationMessages.length > 1) {
              log("🤖 [Server] Using Bedrock with conversation context", {
                messageCount: conversationMessages.length,
                conversationHistory: conversationMessages.map(msg => `${msg.role}: ${msg.content.substring(0, 50)}...`)
              });
              
              // Create conversation messages with context for Bedrock
              const contextContent = context?.map(c => c.text).join('\n\n') || 'No additional context available.';
              
              log("🔍 [Server] Context content for Bedrock:", {
                contextItems: context?.length || 0,
                contextPreview: contextContent.substring(0, 500) + (contextContent.length > 500 ? '...' : ''),
                totalContextLength: contextContent.length
              });
              
              const systemMessage = `You are a helpful assistant for Couchbase Capella, a cloud database service. Use the following context to help answer questions accurately and comprehensively.

Context: ${contextContent}

Please provide helpful, accurate responses about Couchbase Capella based on the context provided.`;
              
              // Format conversation messages properly for Bedrock
              // Bedrock requires conversations to start with a user message, so filter out initial assistant greetings and empty messages
              const conversationMessagesForBedrock = conversationMessages.filter((msg, index) => {
                // Filter out empty or meaningless content
                const content = msg.content?.trim();
                if (!content || content === '...' || content === '') {
                  return false;
                }
                
                // Keep all user messages (they should always have content)
                if (msg.role === 'user') return true;
                
                // For assistant messages, only keep them if there's a user message before them
                const hasUserMessageBefore = conversationMessages.slice(0, index).some(m => m.role === 'user');
                return hasUserMessageBefore;
              });
              
              const conversationForBedrock = [
                { role: 'system', content: systemMessage },
                ...conversationMessagesForBedrock.map(msg => ({
                  role: msg.role === 'user' ? 'user' : 'assistant',
                  content: msg.content
                }))
              ];
              
              log("🔄 [Server] Sending to Bedrock chat service", {
                originalMessageCount: conversationMessages.length,
                filteredMessageCount: conversationMessagesForBedrock.length,
                totalMessages: conversationForBedrock.length,
                messageRoles: conversationForBedrock.map(msg => msg.role),
                filteredOutCount: conversationMessages.length - conversationMessagesForBedrock.length,
                conversationPreview: conversationForBedrock.slice(1).map(msg => `${msg.role}: ${msg.content.substring(0, 100)}...`),
                systemMessageLength: conversationForBedrock[0]?.content?.length || 0,
                systemMessagePreview: conversationForBedrock[0]?.content?.substring(0, 300) + "..."
              });
              
              // Use chat service directly for conversation
              const conversationStream = chatService.createChatCompletion(conversationForBedrock, {
                temperature: 0.7,
                max_tokens: 2000
              });
              
              for await (const chunk of conversationStream) {
                chunkCount++;
                if (chunk) {
                  fullResponse += chunk;
                  const jsonLine = JSON.stringify({ content: chunk }) + "\n";
                  controller.enqueue(new TextEncoder().encode(jsonLine));
                }
              }
            } else {
              // Use regular RAG stream for single message or non-Bedrock providers
              for await (const chunk of stream) {
                chunkCount++;
                let content = "";

                if (typeof chunk === "string") {
                  // Bedrock format - chunk is already a string
                  content = chunk;
                } else if (chunk.choices && chunk.choices[0]?.delta?.content) {
                  // OpenAI format - extract from choices
                  content = chunk.choices[0].delta.content;
                  log("📤 [Server] OpenAI chunk:", {
                    chunkType: "object",
                    length: content.length,
                  });
                }

                if (content) {
                  fullResponse += content;
                  const jsonLine = JSON.stringify({ content }) + "\n";
                  controller.enqueue(new TextEncoder().encode(jsonLine));
                }
              }
            }

            log("🛑 [Server] Stream iteration complete", {
              totalChunks: chunkCount,
              responseLength: fullResponse.length,
            });

            // Handle references differently for conversation mode
            const sourceReferences =
              context
                ?.slice(0, 3)
                .map((c) => ({
                  filename: c.filename || "Unknown",
                  pageNumber: c.pageNumber || 1,
                  score: 0, // We don't have score in context, but keeping structure consistent
                }))
                .filter(
                  (source, index, self) =>
                    // Remove duplicates by page number
                    index ===
                    self.findIndex((s) => s.pageNumber === source.pageNumber),
                )
                .sort((a, b) => a.pageNumber - b.pageNumber) || [];

            // For conversation mode with AWS Knowledge Base, don't append references as they're already in context
            const shouldAppendReferences = !(Bun.env.RAG_PIPELINE === 'AWS_KNOWLEDGE_BASE' && conversationMessages.length > 1);

            log("🔍 [Debug] Source references processing:", {
              contextLength: context?.length || 0,
              sourceReferencesLength: sourceReferences.length,
              hasReferencesInResponse: fullResponse.includes("References:"),
              shouldAppendReferences,
              conversationMode: conversationMessages.length > 1
            });

            // Remove any basic "References:" section from the AI response and replace with page-numbered version
            let processedResponse = fullResponse;

            // Simple approach: find the last occurrence of "References:" and remove everything after it
            const referencesIndex =
              processedResponse.lastIndexOf("References:");
            log("🔍 [Debug] References processing:", {
              referencesIndex,
              originalLength: fullResponse.length,
              foundReferences: referencesIndex !== -1,
            });

            if (referencesIndex !== -1) {
              processedResponse = processedResponse
                .substring(0, referencesIndex)
                .trim();
              log("🔍 [Debug] Processed response after removing references:", {
                newLength: processedResponse.length,
                wasModified: processedResponse !== fullResponse,
              });
            }

            // Only append references if not in conversation mode or using non-Bedrock provider
            if (shouldAppendReferences) {
              const enhancedReferences =
                sourceReferences.length > 0
                  ? `\n\nReferences:\n${sourceReferences
                      .map((ref) => `${ref.filename} (Page ${ref.pageNumber})`)
                      .join("\n")}`
                  : `\n\nReferences:\n${context
                      ?.slice(0, 3)
                      .map((c) => c.filename)
                      .join("\n")}`;

              // Send the processed response without basic references
              if (processedResponse !== fullResponse) {
                // Response was modified, send the corrected content
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({
                      content: processedResponse + enhancedReferences,
                    }) + "\n",
                  ),
                );
              } else {
                // No modification needed, just append enhanced references
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({ content: enhancedReferences }) + "\n",
                  ),
                );
              }
            }

            const doneMessage = JSON.stringify({ done: true }) + "\n";
            controller.enqueue(new TextEncoder().encode(doneMessage));
            log("🏁 [Server] Sent done signal:", {
              doneMessage: doneMessage.trim(),
              finalResponseLength: fullResponse.length,
            });
            controller.close();
            log("🔒 [Server] Stream closed");
          } catch (error) {
            log("❌ Stream processing error:", { 
              errorMessage: error instanceof Error ? error.message : String(error),
              errorType: error instanceof Error ? error.constructor.name : typeof error
            });
            controller.error(error);
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
      },
    );
  } catch (error) {
    err("❌ [Server] Error in chat API:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};
