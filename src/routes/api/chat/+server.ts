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
import { traceable } from "langsmith/traceable";

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

// Create traceable conversation handler - metadata must be passed properly per Langsmith docs
const processConversation = traceable(
  async (currentMessage: string, conversationMessages: any[], metadata: RAGMetadata, ragProvider: any, signal?: AbortSignal) => {
    log("🔄 [TRACE DEBUG] Processing conversation within trace context", {
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
      userId: metadata.userId,
      conversationId: metadata.conversationId,
    });

    // Debug: Check current run context
    const { getCurrentRunTree } = await import("langsmith/traceable");
    const currentRun = getCurrentRunTree();
    log("🔍 [TRACE DEBUG] Current run tree in processConversation:", {
      runId: currentRun?.id,
      runName: currentRun?.name,
      runType: currentRun?.run_type,
      hasParent: !!currentRun?.parent_run_id,
      parentId: currentRun?.parent_run_id,
    });

    try {
      // Execute RAG query within conversation trace context
      const { stream, context } = await ragProvider.query(currentMessage, metadata, conversationMessages);

      log("✅ [TRACE DEBUG] RAG query completed within conversation trace", {
        contextSize: context?.length || 0,
        sourceFiles: context?.map((c) => c.filename).join(", "),
      });

      // Return the run ID along with stream and context
      return { stream, context, runId: currentRun?.id };
    } catch (error) {
      if (signal?.aborted) {
        log("🛑 [Server] RAG query aborted in processConversation");
        throw new Error('Request was aborted');
      }
      throw error;
    }
  },
  {
    run_type: "chain",
    name: "Chat Conversation",
  },
);

export const POST: RequestHandler = async ({ fetch, request }) => {
  const startTime = Date.now();
  log("📥 [Server] Received request");

  // Check if request was aborted early
  if (request.signal?.aborted) {
    log("🛑 [Server] Request aborted before processing");
    return new Response(null, { status: 499 }); // Client Closed Request
  }

  // Note: Only reset if needed to debug, but we want to maintain instance continuity
  // chatService = null;

  try {
    // Initialize provider with fetch
    if (!ragProvider) {
      log("🚀 [Server] Starting RAG system initialization");
      ragProvider = createRAGProvider(fetch);
      log("🔧 [Server] Provider instance created:", {
        type: ragProvider.constructor.name,
      });

      await ragProvider.initialize();
      log("✅ [Server] RAG system initialized:", {
        provider: Bun.env.RAG_PIPELINE,
        timestamp: new Date().toISOString(),
      });
    }

    const requestBody = await request.json();
    const { message, messages, user, enableExtendedThinking } = requestBody;
    
    // Check if aborted after parsing request
    if (request.signal?.aborted) {
      log("🛑 [Server] Request aborted after parsing body");
      return new Response(null, { status: 499 });
    }
    
    // Handle both old single message format and new messages array format
    const conversationMessages = prepareConversationMessages(messages, message);
    let currentMessage = conversationMessages[conversationMessages.length - 1]?.content || message || '';
    
    // Modify message for extended thinking if enabled
    if (enableExtendedThinking) {
      // For very short responses (like "Yes", "No", "Show me"), preserve context
      const originalMessage = currentMessage;
      const isShortResponse = currentMessage.trim().split(' ').length <= 5;
      
      if (isShortResponse && conversationMessages.length > 1) {
        log("🔍 [Extended Thinking] Detected short response, preserving context:", {
          originalMessage,
          messageLength: currentMessage.trim().split(' ').length,
          conversationLength: conversationMessages.length
        });
        
        // Find the last assistant message to provide context
        let lastAssistantMessage = null;
        for (let i = conversationMessages.length - 2; i >= 0; i--) {
          if (conversationMessages[i].role === 'assistant') {
            lastAssistantMessage = conversationMessages[i].content;
            break;
          }
        }
        
        if (lastAssistantMessage) {
          // Extract the last question or suggestion from the assistant's message
          // Look for questions ending with ? or suggestive phrases
          const questionPatterns = [
            /[^.!?]*\?/g,  // Any question ending with ?
            /(would you like|should I|do you want|shall I|can I|may I|I can also|I should|want me to)[^.!?]*/gi,  // Suggestive phrases
            /(In this case|If you want|Alternatively)[^.!?]*[.!?]/gi  // Contextual suggestions
          ];
          
          let questionMatch = null;
          for (const pattern of questionPatterns) {
            const matches = lastAssistantMessage.match(pattern);
            if (matches && matches.length > 0) {
              questionMatch = matches;
              break;
            }
          }
          const contextHint = questionMatch ? `The assistant previously asked: "${questionMatch[questionMatch.length - 1]}"` : 'This appears to be a response to the previous conversation.';
          
          log("🔍 [Extended Thinking] Context extracted:", {
            foundQuestion: !!questionMatch,
            contextHint
          });
          
          currentMessage = `Please think through this step-by-step before answering, using <thinking> tags to show your reasoning process.

${contextHint}

User's response: ${originalMessage}`;
        } else {
          // No previous assistant message found, use standard format
          currentMessage = `Please think through this step-by-step before answering, using <thinking> tags to show your reasoning process.

User's response: ${originalMessage}`;
        }
      } else {
        // For longer messages, use the standard format
        currentMessage = `Please think through this step-by-step before answering, using <thinking> tags to show your reasoning process.

User's question: ${currentMessage}`;
      }
      
      // Also update the last message in conversationMessages
      if (conversationMessages.length > 0) {
        conversationMessages[conversationMessages.length - 1].content = currentMessage;
      }
    }

    // Initialize chat service using global connection approach
    if (!chatService) {
      log("🚀 [Server] Creating chat service with global connection approach");
      chatService = new BedrockChatService("eu-central-1");
      log("✅ [Server] Chat service created (will use global connection for tools)");
    } else {
      log("🔄 [Server] Using existing chat service instance");
    }

    log("📥 [Server] Processing chat request:", {
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

    // Generate thread/conversation ID for continuity
    const conversationId = user?.conversationId || `conv-${user?.id || 'anon'}-${Date.now()}`;
    const sessionId = user?.sessionId || `session-${user?.id || 'anon'}-${Date.now()}`;

    // Prepare metadata for tracing with thread information
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

      // Session Information - Enhanced for thread continuity
      sessionStartTime: user?.sessionStartTime,
      messageCount: user?.messageCount || 1,
      sessionId: sessionId,
      conversationId: conversationId,

      // Request Details
      clientTimestamp: user?.clientTimestamp,
      serverTimestamp: new Date().toISOString(),

      // Performance Metrics
      processingStartTime: startTime,

      // Message Details
      messageLength: currentMessage.length,
      conversationLength: conversationMessages.length,
      
      // Features
      enableExtendedThinking: enableExtendedThinking || false,
    };

    // Check if aborted before RAG query
    if (request.signal?.aborted) {
      log("🛑 [Server] Request aborted before RAG query");
      return new Response(null, { status: 499 });
    }

    log("🔄 [Server] Executing RAG query with conversation context:", {
      messagesCount: conversationMessages.length,
      currentQuery: currentMessage.substring(0, 100) + (currentMessage.length > 100 ? '...' : ''),
      fullConversation: conversationMessages.map((msg, i) => `${i+1}. ${msg.role}: ${msg.content.substring(0, 80)}...`),
      conversationId: conversationId,
      sessionId: sessionId,
    });
    
    // Execute within conversation trace context
    // Pass Langsmith metadata correctly for thread continuity according to docs
    log("🔍 [TRACE DEBUG] Preparing to call processConversation with metadata:", {
      sessionId,
      conversationId,
      userId: user?.id || 'anonymous',
      messageCount: metadata.messageCount,
    });
    
    const { stream, context, runId } = await processConversation(
      currentMessage, 
      conversationMessages, 
      metadata,
      ragProvider,
      request.signal,
      {
        metadata: {
          session_id: sessionId,
          thread_id: conversationId,
          conversation_id: conversationId,
          user_id: user?.id || 'anonymous',
          message_count: metadata.messageCount,
        },
        tags: [
          "conversation",
          "chat-session",
          `user:${user?.id || 'anonymous'}`,
          `conversation:${conversationId}`,
        ],
      }
    );

    log("✅ [Server] Query completed:", {
      contextSize: context?.length || 0,
      processingTime: Date.now() - startTime,
      provider: Bun.env.RAG_PIPELINE,
      sourceFiles: context?.map((c) => c.filename).join(", "),
      runId: runId,
    });

    // Log context metrics
    log("📊 Query Context:", {
      contextSize: context?.length || 0,
      sourceFiles: context?.map((c) => c.filename).join(", "),
      runId: runId,
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
            let startTime = Date.now();
            let lastProgressUpdate = Date.now();
            let tokenCount = 0;
            const PROGRESS_UPDATE_INTERVAL = 3000; // Send progress update every 3 seconds (more frequent)
            const MAX_RESPONSE_TIME = 300000; // Maximum 5 minutes for response (increased from 60s)
            let currentTokenUsage = { input: 0, output: 0, total: 0 }; // Track token usage

            log("🌊 [Server] Starting to read stream with conversation context");
            let chunkCount = 0;
            let toolsWereExecuted = false; // Track if any tools were executed
            let wasTimedOut = false; // Track if response was cut off due to timeout
            
            // Setup abort signal listener
            const abortHandler = () => {
              log("🛑 [Server] Request aborted during stream processing");
              controller.error(new Error('Request was aborted'));
            };
            
            if (request.signal) {
              request.signal.addEventListener('abort', abortHandler);
            }
            
            // Create system message with context
            const contextContent = (context || []).map(c => c.text).join('\n\n') || 'No additional context available.';
            
            log("🔍 [Server] Context content prepared:", {
              contextItems: context?.length || 0,
              contextPreview: contextContent.substring(0, 500) + (contextContent.length > 500 ? '...' : ''),
              totalContextLength: contextContent.length
            });
            
            let systemMessage = `You are Claude, an AI assistant with expertise in Couchbase and Capella database technologies. Your role is to provide accurate, comprehensive, and helpful information based on the available context and tools.

<context>
<relevance>High relevance - context directly related to user query</relevance>
<content>
${contextContent}
</content>
</context>

<guidelines>
- Base your responses on the provided context when available
- Structure your answers clearly with appropriate formatting
- For tool execution results, provide analysis and insights rather than repeating the raw data
- Use markdown formatting to enhance readability (bullet points, code blocks, bold for emphasis)
- When context is insufficient, clearly state what information is missing
- Prioritize accuracy and completeness in your responses
- IMPORTANT: When you offer to execute a tool (e.g., "Would you like me to...?") and the user responds with confirmation ("Yes", "OK", "Sure", "Please", "Go ahead"), immediately execute that tool
- IMPORTANT: If the user provides a very short response like "Yes" without clear context, ask for clarification rather than assuming what they mean
- CRITICAL: If you announce that you will perform an action (e.g., "Let me check...", "I'll analyze...", "Let me also verify..."), you MUST execute that action immediately. Never announce an action without executing it
- Keep responses concise and focused - avoid overly long explanations unless specifically requested
${metadata.enableExtendedThinking ? `- When asked to think step-by-step, use <thinking> tags to show your reasoning
- In your thinking section:
  * Analyze what the user is asking for
  * Determine if you need to use tools or if context provides the answer
  * Consider relevant best practices, performance implications, and common pitfalls
  * Plan how to structure your response clearly
- Your thinking should be natural and conversational, not templated
- After </thinking>, provide your main response without mentioning the thinking process` : ''}
</guidelines>

<terminology>
- Couchbase and Capella refer to the same technology platform
- Capella is Couchbase's cloud database offering  
- Couchbase Server is the core database technology
- These terms can be used interchangeably in responses
</terminology>

<response_format>
- Begin directly with the answer without preamble
- Use clear sections and formatting for complex responses
- Include code examples in markdown code blocks when relevant
- References to sources will be automatically appended - do not include them
</response_format>`;
            
            // Log that extended thinking is enabled
            if (metadata.enableExtendedThinking) {
              log("🧠 [Server] Extended thinking mode enabled for this request");
            }

            // Use the RAG provider stream (contains proper trace headers and tool execution)
            log("🌊 [Server] Starting to read stream with conversation context");
            
            // Send initial progress indicator immediately
            const initialProgress = {
              type: "progress",
              message: "🚀 Starting to process your request...",
              details: "Connecting to AI services and preparing response",
              elapsedTime: 0,
              chunkCount: 0
            };
            controller.enqueue(new TextEncoder().encode(JSON.stringify(initialProgress) + "\n"));
            
            // Set up independent progress timer that runs even when no chunks are received
            let progressTimerActive = true;
            let firstContentReceived = false;
            let toolsInProgress = false;
            const progressTimer = setInterval(() => {
              if (!progressTimerActive || (firstContentReceived && !toolsInProgress)) return;
              
              const elapsedTime = Date.now() - startTime;
              const elapsedSeconds = Math.floor(elapsedTime / 1000);
              
              // Different messages based on elapsed time and tool execution
              let progressMessage = "";
              let progressDetails = "";
              
              if (toolsInProgress) {
                // Special messages during tool execution
                if (elapsedSeconds < 5) {
                  progressMessage = `🔧 Executing tools... (${elapsedSeconds}s)`;
                  progressDetails = "Retrieving live system data from your cluster";
                } else if (elapsedSeconds < 10) {
                  progressMessage = `🔧 Tools still executing... (${elapsedSeconds}s)`;
                  progressDetails = "Analyzing system performance metrics";
                } else if (elapsedSeconds < 20) {
                  progressMessage = `⚙️ Processing tool results... (${elapsedSeconds}s)`;
                  progressDetails = "Complex queries may take additional time";
                } else {
                  progressMessage = `🔄 Extended tool execution... (${elapsedSeconds}s)`;
                  progressDetails = "Large data analysis in progress - please wait";
                }
              } else if (elapsedSeconds < 10) {
                progressMessage = `🚀 Initializing AI response... (${elapsedSeconds}s)`;
                progressDetails = "Setting up conversation context and preparing response";
              } else if (elapsedSeconds < 20) {
                progressMessage = `🤖 AI is processing your request... (${elapsedSeconds}s)`;
                progressDetails = "Analyzing context and formulating response";
              } else if (elapsedSeconds < 30) {
                progressMessage = `🔄 Still processing... (${elapsedSeconds}s)`;
                progressDetails = "This is taking longer than usual - working on complex analysis";
              } else if (elapsedSeconds < 45) {
                progressMessage = `⚡ Continuing to process... (${elapsedSeconds}s)`;
                progressDetails = "Processing complex data - please wait";
              } else if (elapsedSeconds < 60) {
                progressMessage = `🔍 Deep analysis in progress... (${elapsedSeconds}s)`;
                progressDetails = "Almost there - finalizing comprehensive response";
              } else {
                progressMessage = `⏱️ Extended processing... (${elapsedSeconds}s)`;
                progressDetails = `Processing for ${elapsedSeconds} seconds - complex query requiring detailed analysis`;
              }
              
              const progress = {
                type: "progress",
                message: progressMessage,
                details: progressDetails,
                elapsedTime,
                chunkCount,
                isWaitingForAI: chunkCount === 0
              };
              
              try {
                controller.enqueue(new TextEncoder().encode(JSON.stringify(progress) + "\n"));
              } catch (e) {
                // Controller might be closed, stop the timer
                clearInterval(progressTimer);
                progressTimerActive = false;
              }
            }, PROGRESS_UPDATE_INTERVAL);
            
            for await (const chunk of stream) {
              // Check if request was aborted
              if (request.signal?.aborted) {
                log("🛑 [Server] Request aborted during stream iteration");
                clearInterval(progressTimer);
                progressTimerActive = false;
                if (request.signal) {
                  request.signal.removeEventListener('abort', abortHandler);
                }
                controller.close();
                return;
              }
              
              // This block is no longer needed since we track firstContentReceived
              
              // Check for timeout
              const elapsedTime = Date.now() - startTime;
              if (elapsedTime > MAX_RESPONSE_TIME) {
                log("⏱️ [Server] Response timeout reached", {
                  elapsedTime,
                  responseLength: fullResponse.length,
                  chunkCount
                });
                
                wasTimedOut = true;
                
                // Add cleanup message if we're in the middle of content
                const cleanupMessage = "\n\n[... Response truncated due to timeout ...]\n";
                controller.enqueue(new TextEncoder().encode(JSON.stringify({ content: cleanupMessage }) + "\n"));
                
                // Add prominent timeout message
                const timeoutMessage = "\n\n⚠️ **RESPONSE TIMEOUT (5 minutes reached)** ⚠️\n\nThe response was stopped after 5 minutes to prevent system overload. This typically happens when:\n\n• Processing extremely large amounts of data\n• Running multiple complex tool operations\n• Generating very detailed analysis across many items\n\n**What you can do:**\n• Try a more specific query (e.g., 'top 5' instead of 'all')\n• Break down your request into smaller parts\n• Request specific data points or time ranges\n• If you need the full data, try exporting it instead\n";
                controller.enqueue(new TextEncoder().encode(JSON.stringify({ content: timeoutMessage }) + "\n"));
                clearInterval(progressTimer);
                progressTimerActive = false;
                break;
              }
              
              // The independent timer handles progress updates now, so we don't need this
              
              chunkCount++;
              let content = "";

              if (typeof chunk === "string") {
                content = chunk;
              } else if (chunk.choices && chunk.choices[0]?.delta?.content) {
                content = chunk.choices[0].delta.content;
              }

              if (content) {
                // Mark that we've received the first content
                if (!firstContentReceived) {
                  firstContentReceived = true;
                  log("✅ [Server] First content received, progress timer will stop");
                  // Progress timer will stop on its next iteration
                }
                
                fullResponse += content;
                tokenCount += content.length / 4; // Rough token estimate
                
                // Check if chunk contains token usage information
                if (chunk && typeof chunk === 'object' && chunk.tokenUsage) {
                  currentTokenUsage = {
                    input: chunk.tokenUsage.inputTokens || currentTokenUsage.input,
                    output: chunk.tokenUsage.outputTokens || currentTokenUsage.output,
                    total: chunk.tokenUsage.totalTokens || currentTokenUsage.total
                  };
                  
                  // Send token usage update
                  controller.enqueue(new TextEncoder().encode(JSON.stringify({ 
                    tokenUsage: currentTokenUsage,
                    estimatedCost: chunk.tokenUsage.estimatedCost 
                  }) + "\n"));
                }
                
                // Check if tools are being executed
                if (content.includes("[Executing tools...]")) {
                  toolsWereExecuted = true;
                  toolsInProgress = true;
                  log("🔧 [Server] Tools execution detected in stream");
                  
                  // Send progress update to keep indicator visible during tool execution
                  const toolProgress = {
                    type: "progress",
                    message: "🔧 Executing tools...",
                    details: "Retrieving live system data",
                    elapsedTime: Date.now() - startTime,
                    chunkCount,
                    isExecutingTools: true
                  };
                  controller.enqueue(new TextEncoder().encode(JSON.stringify(toolProgress) + "\n"));
                }
                
                // Check if tool results are being displayed (tools finished)
                if (content.includes("### Tool:") && toolsInProgress) {
                  toolsInProgress = false;
                  log("✅ [Server] Tool results detected, tools execution completed");
                }
                
                const jsonLine = JSON.stringify({ content }) + "\n";
                controller.enqueue(new TextEncoder().encode(jsonLine));
              }
            }

            const totalElapsedTime = Date.now() - startTime;
            log("🛑 [Server] Stream iteration complete", {
              totalChunks: chunkCount,
              responseLength: fullResponse.length,
              toolsWereExecuted,
              totalElapsedTime,
              estimatedTokens: Math.floor(tokenCount)
            });
            
            // No need to add incomplete data warning here - it's already handled in the timeout section
            
            // Add performance warning if response took too long
            if (totalElapsedTime > 30000) { // More than 30 seconds
              const performanceWarning = `\n\n⚠️ **Performance notice**: This response took ${Math.floor(totalElapsedTime / 1000)} seconds to generate. For better performance, consider more specific queries or limiting the scope of your request.\n`;
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ content: performanceWarning }) + "\n"));
            }

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

            const doneMessage = JSON.stringify({ done: true, runId: runId }) + "\n";
            controller.enqueue(new TextEncoder().encode(doneMessage));
            log("🛑 [Server] Sent done signal:", {
              doneMessage: doneMessage.trim(),
              finalResponseLength: fullResponse.length,
              runId: runId,
            });
            // Cleanup progress timer and abort handler
            clearInterval(progressTimer);
            progressTimerActive = false;
            if (request.signal) {
              request.signal.removeEventListener('abort', abortHandler);
            }
            
            controller.close();
            log("🔒 [Server] Stream closed");
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if it's an abort error
            if (errorMessage === 'Request was aborted') {
              log("🛑 [Server] Stream processing aborted by client");
            } else {
              log("❌ Stream processing error:", { errorMessage });
            }
            
            // Cleanup progress timer and abort handler
            clearInterval(progressTimer);
            progressTimerActive = false;
            if (request.signal) {
              request.signal.removeEventListener('abort', abortHandler);
            }
            
            // Always try to send a done signal to ensure client doesn't get stuck
            try {
              if (errorMessage !== 'Request was aborted') {
                const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
                const errorJsonLine = JSON.stringify({ 
                  content: userFriendlyError,
                  error: true 
                }) + "\n";
                controller.enqueue(new TextEncoder().encode(errorJsonLine));
              }
              
              // IMPORTANT: Always send done signal even on errors
              const doneMessage = JSON.stringify({ done: true, error: true, runId: runId }) + "\n";
              controller.enqueue(new TextEncoder().encode(doneMessage));
              controller.close();
            } catch (controllerError) {
              log("❌ Failed to send error/done message to client:", { error: controllerError });
              try {
                controller.error(error);
              } catch {
                // Controller might already be errored/closed
              }
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
