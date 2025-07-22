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

// Helper function to prepare conversation messages for streaming
function prepareConversationMessages(messages: any[], currentMessage: string): any[] {
  const conversationMessages = messages || (currentMessage ? [{ role: 'user', content: currentMessage }] : []);
  
  // Basic validation - ensure we have at least one user message
  if (conversationMessages.length === 0) {
    return [{ role: 'user', content: currentMessage }];
  }
  
  return conversationMessages;
}

// Helper function to convert technical errors to user-friendly messages
function getUserFriendlyErrorMessage(errorMessage: string): string {
  const errorPatterns = [
    { pattern: /conversation must start with a user message/i, message: "Please refresh the page and start a new conversation." },
    { pattern: /ValidationException/i, message: "Please try rephrasing your question or starting a new conversation." },
    { pattern: /(throttled|rate limit)/i, message: "Service is experiencing high demand. Please wait a moment and try again." },
    { pattern: /(timeout|TimeoutError)/i, message: "Request timed out. Please try again with a shorter message." },
    { pattern: /(network|connection)/i, message: "Network connectivity issue. Please check your connection and try again." },
    { pattern: /(unauthorized|authentication)/i, message: "Authentication failed. Please refresh the page and sign in again." },
    { pattern: /(forbidden|access denied)/i, message: "You don't have permission to perform this action. Please contact support if this persists." }
  ];

  for (const { pattern, message } of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return message;
    }
  }

  return "I apologize, but I encountered an unexpected error. Please try again, and if the problem persists, consider starting a new conversation.";
}

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
    const conversationMessages = prepareConversationMessages(messages, message);
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
            let toolsWereExecuted = false; // Track if any tools were executed
            
            // Create system message with context
            const contextContent = (context || []).map(c => c.text).join('\n\n') || 'No additional context available.';
            
            log("🔍 [Server] Context content prepared:", {
              contextItems: context?.length || 0,
              contextPreview: contextContent.substring(0, 500) + (contextContent.length > 500 ? '...' : ''),
              totalContextLength: contextContent.length
            });
            
            const systemMessage = `You are a helpful assistant for Couchbase. Use the following context to answer questions accurately and comprehensively.

Context: ${contextContent}

IMPORTANT TERMINOLOGY:
- Couchbase and Capella are interchangeable terms - Capella is Couchbase's cloud database platform
- When users ask about "Couchbase", this includes information about "Capella" and vice versa
- Couchbase Server is the core database technology, Capella is the cloud-based platform built on Couchbase

IMPORTANT INSTRUCTIONS:
- Provide a clear response based ONLY on the context provided
- DO NOT show your thinking process or reasoning steps
- DO NOT include phrases like "The context mentions..." or "I will..."
- DO NOT repeat the same information in different ways
- DO NOT repeat or re-display tool results that were already shown to the user
- When tools have been executed, provide analysis and insights about the results, not a duplicate display
- Start your response directly with the answer, not with explanatory text
- Structure your response clearly without repetitive statements
- Treat questions about Couchbase and Capella as referring to the same technology platform
- NEVER include URLs, links, or references in your response - references will be added automatically
- DO NOT add a "References:" section or any source citations to your answer`;

            // Use either Bedrock conversation mode or regular RAG stream
            if (Bun.env.RAG_PIPELINE === 'AWS_KNOWLEDGE_BASE' && chatService) {
              log("🤖 [Server] Using Bedrock conversation mode", {
                messageCount: conversationMessages.length,
                conversationHistory: conversationMessages.map(msg => `${msg.role}: ${msg.content.substring(0, 50)}...`)
              });
              
              const conversationForBedrock = [
                { role: 'system', content: systemMessage },
                ...conversationMessages.map(msg => ({
                  role: msg.role === 'user' ? 'user' : 'assistant',
                  content: msg.content
                }))
              ];
              
              // Use chat service directly for conversation
              const conversationStream = chatService.createChatCompletion(conversationForBedrock, {
                temperature: 0.7,
                max_tokens: 2000
              });
              
              for await (const chunk of conversationStream) {
                chunkCount++;
                if (chunk) {
                  fullResponse += chunk;
                  
                  // Check if tools are being executed - comprehensive tool detection
                  if (chunk.includes("[Executing tools...]") || 
                      chunk.includes("get_system_vitals") ||
                      chunk.includes("get_system_nodes") ||
                      chunk.includes("get_fatal_requests") ||
                      chunk.includes("get_most_expensive_queries") ||
                      chunk.includes("get_longest_running_queries") ||
                      chunk.includes("get_most_frequent_queries") ||
                      chunk.includes("get_largest_result_size_queries") ||
                      chunk.includes("get_largest_result_count_queries") ||
                      chunk.includes("get_primary_index_queries") ||
                      chunk.includes("get_system_indexes") ||
                      chunk.includes("get_completed_requests") ||
                      chunk.includes("get_prepared_statements") ||
                      chunk.includes("get_indexes_to_drop") ||
                      chunk.includes("get_detailed_indexes") ||
                      chunk.includes("get_detailed_prepared_statements") ||
                      chunk.includes("get_schema_for_collection") ||
                      chunk.includes("run_sql_plus_plus_query") ||
                      chunk.includes("<thinking>")) {
                    toolsWereExecuted = true;
                    log("🔧 [Server] Tools execution detected in stream");
                  }
                  
                  const jsonLine = JSON.stringify({ content: chunk }) + "\n";
                  controller.enqueue(new TextEncoder().encode(jsonLine));
                }
              }
            } else {
              // Use regular RAG stream
              for await (const chunk of stream) {
                chunkCount++;
                let content = "";

                if (typeof chunk === "string") {
                  content = chunk;
                } else if (chunk.choices && chunk.choices[0]?.delta?.content) {
                  content = chunk.choices[0].delta.content;
                }

                if (content) {
                  fullResponse += content;
                  
                  if (content.includes("[Executing tools...]")) {
                    toolsWereExecuted = true;
                  }
                  
                  const jsonLine = JSON.stringify({ content }) + "\n";
                  controller.enqueue(new TextEncoder().encode(jsonLine));
                }
              }
            }

            log("🛑 [Server] Stream iteration complete", {
              totalChunks: chunkCount,
              responseLength: fullResponse.length,
              toolsWereExecuted
            });

            // Add references only if no tools were executed and we have context
            if (!toolsWereExecuted && context && context.length > 0) {
              // DEBUG: Log the full LLM response before any processing
              log("🔍 [Debug] Full LLM response before reference processing:", {
                fullResponseLength: fullResponse.length,
                fullResponsePreview: fullResponse.substring(0, 500) + (fullResponse.length > 500 ? "..." : ""),
                hasReferencesSection: fullResponse.toLowerCase().includes('references:'),
                hasURLs: /https?:\/\/[^\s]+/.test(fullResponse),
                urlMatches: fullResponse.match(/https?:\/\/[^\s]+/g) || []
              });
              
              // Remove any existing references section from the response (multiple patterns)
              let processedResponse = fullResponse;
              
              // Remove references sections with various patterns
              const referencePatterns = [
                /\n\n?References?:\s*[\s\S]*$/i,
                /\n\n?Sources?:\s*[\s\S]*$/i,
                /\n\n?- https?:\/\/[\s\S]*$/i,
                /\n\n?For more information[\s\S]*$/i
              ];
              
              // DEBUG: Log each pattern replacement
              for (const pattern of referencePatterns) {
                const beforeReplacement = processedResponse;
                processedResponse = processedResponse.replace(pattern, '');
                if (beforeReplacement !== processedResponse) {
                  log(`🔍 [Debug] Pattern ${pattern.toString()} matched and removed:`, {
                    beforeLength: beforeReplacement.length,
                    afterLength: processedResponse.length,
                    removedContent: beforeReplacement.substring(processedResponse.length).substring(0, 200)
                  });
                }
              }
              
              // DEBUG: Log the processed response after reference removal
              log("🔍 [Debug] Processed response after reference cleaning:", {
                processedResponseLength: processedResponse.length,
                processedResponsePreview: processedResponse.substring(Math.max(0, processedResponse.length - 300)),
                stillHasURLs: /https?:\/\/[^\s]+/.test(processedResponse),
                remainingURLs: processedResponse.match(/https?:\/\/[^\s]+/g) || []
              });
              
              processedResponse = processedResponse.trim();

              // Create clean reference list from top 5 context items with diversity
              const sourceReferences = context
                .slice(0, 5)  // Increased from 3 to show more sources
                .map((c) => ({
                  ref: `${c.filename || "Unknown"} (Page ${c.pageNumber || 1})`,
                  filename: c.filename || "Unknown"
                }))
                .filter((item, index, self) => 
                  // Remove exact duplicates but allow different pages from same document
                  index === self.findIndex(i => i.ref === item.ref)
                )
                .slice(0, 5)  // Limit to 5 unique references
                .map(item => item.ref)
                .join("\n");

              const enhancedReferences = `\n\nReferences:\n${sourceReferences}`;
              
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ content: enhancedReferences }) + "\n",
                ),
              );
              
              log("📚 [Server] Added references:", { count: context.slice(0, 3).length });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            log("❌ Stream processing error:", { errorMessage });
            
            // Send user-friendly error message to client
            const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
            const errorJsonLine = JSON.stringify({ 
              content: userFriendlyError,
              error: true 
            }) + "\n";
            
            try {
              controller.enqueue(new TextEncoder().encode(errorJsonLine));
              const doneMessage = JSON.stringify({ done: true }) + "\n";
              controller.enqueue(new TextEncoder().encode(doneMessage));
              controller.close();
            } catch (controllerError) {
              log("❌ Failed to send error message to client:", { error: controllerError });
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
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    err("❌ [Server] Error in chat API:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    // Return user-friendly error response instead of throwing
    const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: true, 
        message: userFriendlyError 
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
