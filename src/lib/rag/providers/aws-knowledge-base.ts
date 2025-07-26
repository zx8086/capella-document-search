/* src/lib/rag/providers/aws-knowledge-base.ts */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RAGProvider, RAGResponse, RAGMetadata, ConversationMessage } from "../types";
import { traceable } from "langsmith/traceable";
import { getCurrentRunTree } from "langsmith/singletons/traceable";
import { BedrockChatService } from "../../services/bedrock-chat";
import { backendConfig } from "../../../backend-config";
import { log, err } from "../../../utils/unifiedLogger";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export class AWSKnowledgeBaseRAGProvider implements RAGProvider {
  private chatService: BedrockChatService;
  private client: BedrockAgentRuntimeClient;
  private knowledgeBaseId: string;
  private ragPipeline: any;

  constructor() {
    log("🚀 [AWSKnowledgeBaseProvider] Constructor called");
    this.chatService = new BedrockChatService(backendConfig.rag.AWS_REGION);

    const credentials: any = {
      accessKeyId: backendConfig.rag.AWS_ACCESS_KEY_ID,
      secretAccessKey: backendConfig.rag.AWS_SECRET_ACCESS_KEY,
    };

    this.client = new BedrockAgentRuntimeClient({
      region: backendConfig.rag.AWS_REGION,
      credentials,
      maxAttempts: 3,
      retryMode: "adaptive",
      // Use HTTP/1.1 handler to avoid Bun HTTP/2 compatibility issues
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
      }),
    });

    this.knowledgeBaseId = backendConfig.rag.KNOWLEDGE_BASE_ID;
  }

  // Helper function to calculate text similarity (simple Jaccard similarity)
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(" ").filter((w) => w.length > 3)); // Filter short words
    const words2 = new Set(text2.split(" ").filter((w) => w.length > 3));

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // Helper function to deduplicate similar context items to prevent repetitive responses
  private deduplicateContext(context: any[]): any[] {
    if (!context || context.length === 0) return [];

    const uniqueItems: any[] = [];
    const seenContent = new Set<string>();

    for (const item of context) {
      if (!item.text) continue;

      // Create a normalized version for comparison (remove extra spaces, normalize text)
      const normalizedText = item.text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      // Check for substantial overlap with existing content
      let isDuplicate = false;
      for (const existingText of seenContent) {
        const similarity = this.calculateTextSimilarity(
          normalizedText,
          existingText,
        );
        if (similarity > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueItems.push(item);
        seenContent.add(normalizedText);
      }
    }

    log(
      `🔄 [AWSKnowledgeBase] Context deduplication: ${context.length} -> ${uniqueItems.length} items`,
    );
    return uniqueItems;
  }

  private knowledgeBaseRetrieval = async (message: string) => {
      log("🔍 [AWSKnowledgeBase] Starting knowledge base retrieval", {
        messageLength: message.length,
        knowledgeBaseId: this.knowledgeBaseId,
      });

      try {
        const enhancedQuery = message;

        const command = new RetrieveCommand({
          knowledgeBaseId: this.knowledgeBaseId,
          retrievalQuery: {
            text: enhancedQuery,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 10,
              overrideSearchType: "SEMANTIC",
            },
          },
        });

        const startTime = Date.now();
        const response = await this.client.send(command);
        const retrievalTime = Date.now() - startTime;

        log("✅ [AWSKnowledgeBase] Knowledge base retrieval complete", {
          resultCount: response.retrievalResults?.length || 0,
          retrievalTimeMs: retrievalTime,
        });

        return { response, retrievalTime };
      } catch (error) {
        err("❌ [AWSKnowledgeBase] Knowledge base retrieval failed", {
          error: error.message,
          errorType: error.constructor.name,
          knowledgeBaseId: this.knowledgeBaseId,
          messageLength: message.length,
          awsRegion: backendConfig.rag.AWS_REGION,
        });

        // Re-throw with additional context
        const enhancedError = new Error(
          `Knowledge base retrieval failed: ${error.message}`,
        );
        enhancedError.name = "KnowledgeBaseRetrievalError";
        enhancedError.cause = error;
        throw enhancedError;
      }
    };

  private contextProcessing = async (response: any) => {
      log("🔄 [AWSKnowledgeBase] Starting context processing", {
        resultCount: response.retrievalResults?.length || 0,
      });

      try {
        const startTime = Date.now();

        // Check if response is valid
        if (!response || !response.retrievalResults) {
          log("⚠️ [AWSKnowledgeBase] No retrieval results in response");
          return { context: [], processingTime: 0, totalChars: 0, avgScore: 0 };
        }

        const rawContext =
          response.retrievalResults
            ?.map((result) => ({
              text: result.content?.text || "",
              filename: this.extractFilename(
                result.location?.s3Location?.uri || "Unknown source",
              ),
              pageNumber:
                this.extractPageNumberFromMetadata(result.metadata) ||
                this.extractPageNumber(result.location?.s3Location?.uri),
              chunkIndex: undefined,
              metadata: {
                score: result.score,
                uri: result.location?.s3Location?.uri,
                type: result.location?.type,
                ...result.metadata,
              },
            }))
            .filter((item) => item.text.trim().length > 0) || [];

        // Apply deduplication to prevent repetitive responses
        const dedupedContext = this.deduplicateContext(rawContext);

        // Sort by relevance score first
        const sortedContext = dedupedContext.sort(
          (a, b) => (b.metadata.score || 0) - (a.metadata.score || 0),
        );

        // Take top results, preferring higher scores but ensuring diversity
        const context = sortedContext.slice(0, 8); // Take top 8 from 10 retrieved

        log("📊 [AWSKnowledgeBase] Context selection", {
          totalRetrieved: rawContext.length,
          afterDedup: dedupedContext.length,
          selected: context.length,
          scoreRange:
            context.length > 0
              ? {
                  highest: context[0]?.metadata.score || 0,
                  lowest: context[context.length - 1]?.metadata.score || 0,
                }
              : null,
        });

        const processingTime = Date.now() - startTime;
        const totalChars = context.reduce(
          (sum, item) => sum + item.text.length,
          0,
        );
        const avgScore =
          context.length > 0
            ? context.reduce(
                (sum, item) => sum + (item.metadata.score || 0),
                0,
              ) / context.length
            : 0;

        log("✅ [AWSKnowledgeBase] Context processing complete", {
          originalItems: rawContext.length,
          contextItems: context.length,
          totalChars,
          avgScore: avgScore.toFixed(3),
          processingTimeMs: processingTime,
        });

        return { context, processingTime, totalChars, avgScore };
      } catch (error) {
        err("❌ [AWSKnowledgeBase] Context processing failed", {
          error: error.message,
          errorType: error.constructor.name,
          responseType: typeof response,
          hasRetrievalResults: !!(response && response.retrievalResults),
          retrievalResultsCount: response?.retrievalResults?.length || 0,
        });

        // Re-throw with additional context
        const enhancedError = new Error(
          `Context processing failed: ${error.message}`,
        );
        enhancedError.name = "ContextProcessingError";
        enhancedError.cause = error;
        throw enhancedError;
      }
    };

  private llmCompletion = async (message: string, context: any[], messages?: ConversationMessage[]) => {
      log("🤖 [AWSKnowledgeBase] Starting LLM completion", {
        messageLength: message.length,
        contextItems: context.length,
        hasConversationHistory: !!(messages && messages.length > 0),
        conversationLength: messages?.length || 0,
      });

      try {
        const startTime = Date.now();

        // Validate inputs
        if (!message || message.trim().length === 0) {
          throw new Error("Empty message provided to LLM completion");
        }

        if (!Array.isArray(context)) {
          log("⚠️ [AWSKnowledgeBase] Context is not an array, converting");
          context = context ? [context] : [];
        }

        const contextText = context?.map((c) => c.text).join("\n\n---\n\n");
        const totalContextLength = contextText.length;

        log("🔄 [AWSKnowledgeBase] Prepared context for LLM", {
          contextItems: context.length,
          totalContextLength,
          messageLength: message.length,
        });

        // Get current run tree and convert to headers for distributed tracing BEFORE creating traceable wrapper
        let traceHeaders: Record<string, string> | undefined;
        try {
          const currentRunTree = getCurrentRunTree(true);
          if (currentRunTree) {
            traceHeaders = currentRunTree.toHeaders();
            log("🔗 [AWSKnowledgeBase] Passing trace context to BedrockChat", {
              traceId: currentRunTree.id,
              parentId: currentRunTree.parent_run_id,
              headerKeys: Object.keys(traceHeaders),
              traceHeadersValue: traceHeaders,
            });
          } else {
            log("⚠️ [AWSKnowledgeBase] No current run tree found for trace headers");
          }
        } catch (error) {
          log("⚠️ [AWSKnowledgeBase] Failed to get trace headers", {
            error: error.message,
          });
        }

        // Build options object with explicit traceHeaders check
        const chatOptions: any = {
          temperature: 0.7,
          max_tokens: 4096,  // Increased from 2000 to allow for longer responses with tool results
        };

        // Only add traceHeaders if they exist to avoid undefined values
        if (traceHeaders) {
          chatOptions.traceHeaders = traceHeaders;
          log("✅ [AWSKnowledgeBase] Including trace headers in chat options", {
            headerKeys: Object.keys(traceHeaders),
            optionsKeys: Object.keys(chatOptions),
          });
        } else {
          log("⚠️ [AWSKnowledgeBase] No trace headers to include in chat options");
        }

        // Build conversation messages with system prompt and context
        const systemMessage = {
          role: "system",
          content: `You are a helpful assistant for Couchbase with access to both documentation context and live database tools.

🔴 TOOL USAGE GUIDELINES 🔴

ONLY USE TOOLS FOR LIVE SYSTEM DATA REQUESTS:

🔧 USE TOOLS WHEN USER WANTS CURRENT/LIVE DATA:
- "show me the longest running queries" → get_longest_running_queries()
- "what are my system vitals" → get_system_vitals() 
- "show me my nodes" / "list all nodes" → get_system_nodes()
- "show me completed requests" → get_completed_requests()
- "show me failed queries" → get_fatal_requests()
- "show me expensive queries" → get_most_expensive_queries()
- "show me system indexes" → get_system_indexes()

🚫 DO NOT USE TOOLS FOR:
- General questions about "how to" or "what is"
- Requests for N1QL query syntax or examples
- Conceptual questions about database operations
- Questions that can be answered from documentation context

🎯 DECISION LOGIC:
- If user says "show me", "what are my", "do I have" → USE TOOLS
- If user says "how to", "what is the query for", "how can I" → USE CONTEXT ONLY

✅ CORRECT BEHAVIOR:
1. For live data requests → Call appropriate tool function
2. For conceptual/syntax questions → Use documentation context only
3. Never fabricate system data or query results

CONTEXT USAGE:
Only use the provided context for:
- General documentation questions
- Explaining concepts and features  
- Showing N1QL query syntax examples

NEVER use context to answer questions about current system state, running queries, or live metrics.

RESPONSE GUIDELINES:
- Do not include references in your response as they will be added automatically
- When showing live data from tools, display ALL items - do not summarize
- If you cannot answer based on context or tools, say so clearly

CONTEXT FOR CURRENT QUERY:
${contextText}`,
        };

        // Build conversation messages
        let conversationMessages = [];
        
        // If we have conversation history, use it
        if (messages && messages.length > 0) {
          // Add system message first
          conversationMessages.push(systemMessage);
          
          // Add all conversation messages
          conversationMessages.push(...messages);
          
          // If the last message doesn't match our current message, add it
          const lastMessage = messages[messages.length - 1];
          if (!lastMessage || lastMessage.content !== message) {
            conversationMessages.push({
              role: "user",
              content: message,
            });
          }
        } else {
          // No conversation history, use the traditional format
          conversationMessages = [
            systemMessage,
            {
              role: "user",
              content: message,
            },
          ];
        }

        // Call chat service with full conversation history
        const stream = await this.chatService.createChatCompletion(
          conversationMessages,
          chatOptions, // Pass the explicitly built options object
        );

        const llmTime = Date.now() - startTime;

        log("✅ [AWSKnowledgeBase] LLM completion initiated", {
          llmSetupTimeMs: llmTime,
          totalContextLength,
        });

        return { stream, llmTime };
      } catch (error) {
        err("❌ [AWSKnowledgeBase] LLM completion failed", {
          error: error.message,
          errorType: error.constructor.name,
          messageLength: message.length,
          contextItems: Array.isArray(context) ? context.length : "not-array",
          contextType: typeof context,
        });

        // Re-throw with additional context
        const enhancedError = new Error(
          `LLM completion failed: ${error.message}`,
        );
        enhancedError.name = "LLMCompletionError";
        enhancedError.cause = error;
        throw enhancedError;
      }
    };

  private createStreamWrapper(
    stream: AsyncGenerator<string>,
    metadata: any,
  ): AsyncGenerator<string> {
    // Simple logging function without separate trace
    const logCompleteResponse = (streamContent: string[], metadata: any) => {
      const responseContent = streamContent.join("");
      const streamStats = {
        response: responseContent,
        chunkCount: streamContent.length,
        responseLength: responseContent.length,
        avgChunkSize: Math.round(responseContent.length / streamContent.length),
        contextItems: metadata.contextItems,
        avgRelevanceScore: metadata.avgRelevanceScore,
        totalContextChars: metadata.totalContextChars,
      };
      
      log("✅ [AWSKnowledgeBase] Response stream captured for tracing", {
        ...streamStats,
        responsePreview: responseContent.substring(0, 100) + "...",
      });
      
      return streamStats;
    };

    // Return an async generator that captures content while streaming
    return (async function* () {
      log("🌊 [AWSKnowledgeBase] Starting response stream capture", {
        contextItems: metadata.contextItems,
        totalContextChars: metadata.totalContextChars,
      });

      const chunks: string[] = [];
      const startTime = Date.now();

      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
          yield chunk;
        }

        const streamTime = Date.now() - startTime;
        
        // Log the complete response without separate trace
        logCompleteResponse(chunks, {
          ...metadata,
          streamTimeMs: streamTime,
        });
        
      } catch (error) {
        err("❌ [AWSKnowledgeBase] Stream capture failed", {
          error: error.message,
          chunkCount: chunks.length,
          partialResponseLength: chunks.join("").length,
        });
        throw error;
      }
    })();
  }

  async initialize() {
    log("🚀 [AWSKnowledgeBaseProvider] Starting initialization with config", {
      knowledgeBaseId: this.knowledgeBaseId,
      region: backendConfig.rag.AWS_REGION,
      timestamp: new Date().toISOString(),
    });

    log(
      "📊 [AWSKnowledgeBase] Creating traceable pipeline with sub-components",
    );

    // Create simple pipeline that executes within conversation trace context
    // Create child traceable operations that will nest under the conversation trace
    const tracedKnowledgeBaseRetrieval = traceable(
      this.knowledgeBaseRetrieval,
      {
        name: "Knowledge Base Retrieval",
        run_type: "retriever",
      }
    );

    const tracedContextProcessing = traceable(
      this.contextProcessing,
      {
        name: "Context Processing", 
        run_type: "chain",
      }
    );

    const tracedLLMCompletion = traceable(
      this.llmCompletion,
      {
        name: "LLM Completion",
        run_type: "llm",
      }
    );

    this.ragPipeline = async (message: string, messages?: ConversationMessage[]) => {
      log("🔄 [TRACE DEBUG] Starting RAG pipeline within conversation trace", {
        messageLength: message.length,
        hasConversationHistory: !!(messages && messages.length > 0),
        conversationLength: messages?.length || 0,
      });

      // Debug: Check current run context
      const currentRun = getCurrentRunTree();
      log("🔍 [TRACE DEBUG] Current run tree in RAG pipeline:", {
        runId: currentRun?.id,
        runName: currentRun?.name,
        runType: currentRun?.run_type,
        hasParent: !!currentRun?.parent_run_id,
        parentId: currentRun?.parent_run_id,
      });

      const pipelineStartTime = Date.now();

      // Step 1: Knowledge Base Retrieval (child trace)
      const { response, retrievalTime } = await tracedKnowledgeBaseRetrieval(message);

      // Step 2: Context Processing (child trace)
      const { context, processingTime, totalChars, avgScore } = await tracedContextProcessing(response);

      // Step 3: LLM Completion (child trace)
      const { stream, llmTime } = await tracedLLMCompletion(message, context, messages);

      // Create a simple stream wrapper to capture the final response
      const wrappedStream = this.createStreamWrapper(stream, {
        message,
        contextItems: context.length,
        totalContextChars: totalChars,
        avgRelevanceScore: avgScore,
      });

        const totalPipelineTime = Date.now() - pipelineStartTime;

        log("✅ [AWSKnowledgeBase] RAG pipeline complete", {
          totalPipelineTimeMs: totalPipelineTime,
          retrievalTimeMs: retrievalTime,
          processingTimeMs: processingTime,
          llmSetupTimeMs: llmTime,
          contextItems: context.length,
          totalContextChars: totalChars,
          avgRelevanceScore: avgScore,
        });

      return { stream: wrappedStream, context };
    };

    log("✅ [AWSKnowledgeBase] Initialization complete with enhanced tracing");
  }

  async query(message: string, metadata: RAGMetadata, messages?: ConversationMessage[]): Promise<RAGResponse> {
    log("📥 [AWSKnowledgeBaseProvider] Query received", {
      messageLength: message.length,
      userId: metadata.userId,
      timestamp: new Date().toISOString(),
      hasConversationHistory: !!(messages && messages.length > 0),
      conversationLength: messages?.length || 0,
    });

    try {
      const queryStart = Date.now();

      // Generate thread/session ID for conversation tracking
      const threadId =
        metadata.sessionId || `session-${metadata.userId}-${Date.now()}`;

      const result = await this.ragPipeline(message, messages);

      const queryEnd = Date.now();
      const totalQueryTime = queryEnd - queryStart;

      log("✅ [AWSKnowledgeBaseProvider] Query completed successfully", {
        totalQueryTimeMs: totalQueryTime,
        userId: metadata.userId,
        threadId,
        hasContext: !!(result.context && result.context.length > 0),
        contextItems: result.context?.length || 0,
      });

      return result;
    } catch (error) {
      const errorContext = {
        error: error.message,
        errorType: error.constructor.name,
        stage: "query",
        messageLength: message.length,
        userId: metadata.userId,
        environment: metadata.environment,
        timestamp: new Date().toISOString(),
        stackTrace: error.stack?.split("\n").slice(0, 5).join("\n"),
      };

      err(
        "❌ [AWSKnowledgeBaseProvider] Query error with context",
        errorContext,
      );

      // Add error annotations for LangSmith
      if (error.annotate && typeof error.annotate === "function") {
        error.annotate({
          error_type: error.constructor.name,
          error_stage: "aws-knowledge-base-query",
          user_id: metadata.userId,
          message_length: message.length,
          environment: metadata.environment,
        });
      }

      throw error;
    }
  }

  private extractFilename(uri: string): string {
    if (!uri || uri === "Unknown source") {
      return "Unknown source";
    }

    try {
      const urlParts = uri.split("/");
      const filename = urlParts[urlParts.length - 1];
      return filename || "Unknown source";
    } catch (error) {
      log("⚠️ [AWSKnowledgeBase] Failed to extract filename from URI", { uri });
      return "Unknown source";
    }
  }

  private extractPageNumberFromMetadata(metadata?: any): number | undefined {
    if (!metadata) return undefined;

    try {
      const pageNumber = metadata["x-amz-bedrock-kb-document-page-number"];
      if (pageNumber && typeof pageNumber === "number" && pageNumber > 0) {
        return pageNumber;
      }

      if (pageNumber && typeof pageNumber === "string") {
        const parsed = parseInt(pageNumber, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }

      return undefined;
    } catch (error) {
      log("⚠️ [AWSKnowledgeBase] Failed to extract page number from metadata", {
        metadata,
      });
      return undefined;
    }
  }

  private extractPageNumber(uri?: string): number | undefined {
    if (!uri) return undefined;

    try {
      const pageMatch = uri.match(/page[_-]?(\d+)/i);
      if (pageMatch && pageMatch[1]) {
        return parseInt(pageMatch[1], 10);
      }
      return 1;
    } catch (error) {
      log("⚠️ [AWSKnowledgeBase] Failed to extract page number from URI", {
        uri,
      });
      return 1;
    }
  }
}
