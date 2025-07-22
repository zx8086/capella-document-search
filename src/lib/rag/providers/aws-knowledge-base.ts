/* src/lib/rag/providers/aws-knowledge-base.ts */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RAGProvider, RAGResponse, RAGMetadata } from "../types";
import { traceable } from "langsmith/traceable";
import { BedrockChatService } from "../../services/bedrock-chat";
import { backendConfig } from "../../../backend-config";
import { log, err } from "../../../utils/unifiedLogger";
import { NodeHttpHandler } from "@smithy/node-http-handler";

export class AWSKnowledgeBaseRAGProvider implements RAGProvider {
  private chatService: BedrockChatService;
  private client: BedrockAgentRuntimeClient;
  private knowledgeBaseId: string;
  private traceablePipeline: any;

  constructor() {
    log("🎯 [AWSKnowledgeBaseProvider] Constructor called");
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
    const words1 = new Set(text1.split(' ').filter(w => w.length > 3)); // Filter short words
    const words2 = new Set(text2.split(' ').filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
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
        .replace(/\s+/g, ' ')
        .trim();
      
      // Check for substantial overlap with existing content
      let isDuplicate = false;
      for (const existingText of seenContent) {
        const similarity = this.calculateTextSimilarity(normalizedText, existingText);
        if (similarity > 0.8) { // 80% similarity threshold
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueItems.push(item);
        seenContent.add(normalizedText);
      }
    }
    
    log(`🔄 [AWSKnowledgeBase] Context deduplication: ${context.length} -> ${uniqueItems.length} items`);
    return uniqueItems;
  }

  private tracedKnowledgeBaseRetrieval = traceable(
    async (message: string) => {
      log("🔍 [AWSKnowledgeBase] Starting knowledge base retrieval", {
        messageLength: message.length,
        knowledgeBaseId: this.knowledgeBaseId,
      });

      try {
        // Use the original query without hardcoded enhancements
        const enhancedQuery = message;
        
        const command = new RetrieveCommand({
          knowledgeBaseId: this.knowledgeBaseId,
          retrievalQuery: {
            text: enhancedQuery,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 10,  // Increased from 5 to get more diverse results
              overrideSearchType: "SEMANTIC",  // Keep as SEMANTIC as required by knowledge base
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
    },
    {
      run_type: "retriever",
      name: "AWS Knowledge Base Retrieval",
      tags: [
        "retrieval",
        "aws-knowledge-base",
        "vector-search",
        "semantic-search",
        "document-retrieval",
        "embeddings",
      ],
    },
  );

  private tracedContextProcessing = traceable(
    async (response: any) => {
      log("📝 [AWSKnowledgeBase] Starting context processing", {
        resultCount: response.retrievalResults?.length || 0,
      });

      try {
        const startTime = Date.now();

        // Check if response is valid
        if (!response || !response.retrievalResults) {
          log("⚠️ [AWSKnowledgeBase] No retrieval results in response");
          return { context: [], processingTime: 0, totalChars: 0, avgScore: 0 };
        }

        // Extract context from AWS Knowledge Base response with correct page numbers
        const rawContext =
          response.retrievalResults
            ?.map((result, index) => {
              const contextItem = {
                text: result.content?.text || "",
                filename: this.extractFilename(
                  result.location?.s3Location?.uri || "Unknown source",
                ),
                pageNumber: this.extractPageNumberFromMetadata(result.metadata) || this.extractPageNumber(result.location?.s3Location?.uri),
                chunkIndex: undefined, // AWS Knowledge Base doesn't provide chunk index
                metadata: {
                  score: result.score,
                  uri: result.location?.s3Location?.uri,
                  type: result.location?.type,
                  ...result.metadata,
                },
              };
              
              // DEBUG: Log document text content to check for URLs
              if (index < 3) { // Only log first 3 items to avoid spam
                log(`🔍 [Debug] AWS KB Document ${index + 1} content analysis:`, {
                  filename: contextItem.filename,
                  pageNumber: contextItem.pageNumber,
                  textLength: contextItem.text.length,
                  textPreview: contextItem.text.substring(0, 200) + (contextItem.text.length > 200 ? "..." : ""),
                  hasURLs: /https?:\/\/[^\s]+/.test(contextItem.text),
                  urlsInText: contextItem.text.match(/https?:\/\/[^\s]+/g) || [],
                  metadataKeys: Object.keys(contextItem.metadata),
                  metadataWithURLs: Object.entries(contextItem.metadata)
                    .filter(([key, value]) => typeof value === 'string' && /https?:\/\//.test(value))
                    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
                });
              }
              
              return contextItem;
            })
            .filter((item) => item.text.trim().length > 0) || [];

        // Apply deduplication to prevent repetitive responses
        const dedupedContext = this.deduplicateContext(rawContext);
        
        // Sort by relevance score first
        const sortedContext = dedupedContext.sort((a, b) => 
          (b.metadata.score || 0) - (a.metadata.score || 0)
        );
        
        // Take top results, preferring higher scores but ensuring diversity
        const context = sortedContext.slice(0, 8); // Take top 8 from 10 retrieved
        
        log("📊 [AWSKnowledgeBase] Context selection", {
          totalRetrieved: rawContext.length,
          afterDedup: dedupedContext.length,
          selected: context.length,
          scoreRange: context.length > 0 ? {
            highest: context[0]?.metadata.score || 0,
            lowest: context[context.length - 1]?.metadata.score || 0
          } : null
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
    },
    {
      run_type: "parser",
      name: "Context Processing",
      tags: [
        "context-processing",
        "document-parsing",
        "text-extraction",
        "data-transformation",
        "content-filtering",
        "metadata-enrichment",
      ],
    },
  );

  private tracedLLMCompletion = traceable(
    async (message: string, context: any[]) => {
      log("🤖 [AWSKnowledgeBase] Starting LLM completion", {
        messageLength: message.length,
        contextItems: context.length,
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

        log("📝 [AWSKnowledgeBase] Prepared context for LLM", {
          contextItems: context.length,
          totalContextLength,
          messageLength: message.length,
        });

        // Generate completion using Bedrock
        const stream = await this.chatService.createChatCompletion(
          [
            {
              role: "system",
              content: `You are a helpful assistant for Couchbase. Use the following context to answer the user's question. If you cannot answer the question based on the context, say so.

CRITICAL INSTRUCTION - READ CAREFULLY:
You must NEVER include any URLs, links, references, or source citations in your response. This is absolutely forbidden. References will be automatically added after your response.

FORBIDDEN CONTENT - DO NOT INCLUDE ANY OF THESE:
- URLs (like https://www.couchbase.com/customers/anything)
- Website links of any kind
- References sections
- Source document names
- Page numbers
- Phrases like "References:", "Sources:", "For more information"
- Any text that looks like: "References:\nfilename.pdf (Page X)"

IMPORTANT TERMINOLOGY:
- Couchbase and Capella are interchangeable terms - Capella is Couchbase's cloud database platform
- When users ask about "Couchbase", this includes information about "Capella" and vice versa
- Couchbase Server is the core database technology, Capella is the cloud-based platform built on Couchbase

RESPONSE INSTRUCTIONS:
- DO NOT show your thinking process or reasoning steps
- DO NOT include phrases like "The context mentions..." or "I will..." or "Based on the context..."
- Start your response directly with the answer
- When showing query results or data, display ALL items - do not summarize or show only one example
- Treat questions about Couchbase and Capella as referring to the same technology platform
- End your response with a period, nothing else

REMINDER: NO URLS, NO LINKS, NO REFERENCES IN YOUR RESPONSE. PERIOD.

When the user asks "How can I see [something]" or "How do I find [something]", they want to know the N1QL query syntax/code, not execute it. In those cases, show them the query code like in the context provided.`,
            },
            {
              role: "user",
              content: `Context: ${contextText}\n\nQuestion: ${message}`,
            },
          ],
          {
            temperature: 0.7,
            max_tokens: 2000,
          },
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
    },
    {
      run_type: "llm",
      name: "Bedrock Chat Completion",
      tags: [
        "llm",
        "bedrock",
        "chat-completion",
        "streaming",
        "generation",
        "aws-nova-pro",
        "conversational-ai",
      ],
    },
  );

  private createTracedStreamWrapper = traceable(
    async function* (stream: AsyncGenerator<string>, metadata: any) {
      log("🌊 [AWSKnowledgeBase] Starting response stream capture", {
        contextItems: metadata.contextItems,
        totalContextChars: metadata.totalContextChars,
      });

      let responseContent = "";
      let chunkCount = 0;
      const startTime = Date.now();

      try {
        for await (const chunk of stream) {
          responseContent += chunk;
          chunkCount++;
          yield chunk;
        }

        const streamTime = Date.now() - startTime;
        const responseLength = responseContent.length;

        log("✅ [AWSKnowledgeBase] Response stream complete", {
          chunkCount,
          responseLength,
          streamTimeMs: streamTime,
          avgChunkSize: Math.round(responseLength / chunkCount),
        });

        // Log the final response for LangSmith tracing
        return {
          response: responseContent,
          chunkCount,
          responseLength,
          streamTimeMs: streamTime,
          contextItems: metadata.contextItems,
          avgRelevanceScore: metadata.avgRelevanceScore,
        };
      } catch (error) {
        err("❌ [AWSKnowledgeBase] Stream capture failed", {
          error: error.message,
          chunkCount,
          partialResponseLength: responseContent.length,
        });
        throw error;
      }
    },
    {
      run_type: "llm",
      name: "Response Stream Capture",
      tags: [
        "response-capture",
        "streaming",
        "final-output",
        "content-logging",
      ],
    },
  );


  async initialize() {
    log("🚀 [AWSKnowledgeBaseProvider] Starting initialization with config", {
      knowledgeBaseId: this.knowledgeBaseId,
      region: backendConfig.rag.AWS_REGION,
      timestamp: new Date().toISOString(),
    });

    log(
      "📊 [AWSKnowledgeBase] Creating traceable pipeline with sub-components",
    );

    // Create traced pipeline that orchestrates sub-components with individual tracing
    this.traceablePipeline = traceable(
      async (message: string) => {
        log("🔄 [AWSKnowledgeBase] Starting RAG pipeline", {
          messageLength: message.length,
        });

        const pipelineStartTime = Date.now();

        // Step 1: Knowledge Base Retrieval (with individual trace)
        const { response, retrievalTime } =
          await this.tracedKnowledgeBaseRetrieval(message);

        // Step 2: Context Processing (with individual trace)
        const { context, processingTime, totalChars, avgScore } =
          await this.tracedContextProcessing(response);

        // Step 3: LLM Completion (with individual trace)
        const { stream, llmTime } = await this.tracedLLMCompletion(
          message,
          context,
        );

        // Create a traced stream wrapper to capture the final response
        const tracedStream = this.createTracedStreamWrapper(stream, {
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

        return { stream: tracedStream, context };
      },
      {
        run_type: "chain",
        name: "AWS Knowledge Base RAG Pipeline",
        tags: ["rag-pipeline", "aws-knowledge-base", "chat", "end-to-end"],
      },
    );

    log("✅ [AWSKnowledgeBase] Initialization complete with enhanced tracing");
  }

  async query(message: string, metadata: RAGMetadata): Promise<RAGResponse> {
    log("📝 [AWSKnowledgeBaseProvider] Query received", {
      messageLength: message.length,
      userId: metadata.userId,
      timestamp: new Date().toISOString(),
    });

    try {
      const queryStart = Date.now();

      // Generate thread/session ID for conversation tracking
      const threadId =
        metadata.sessionId || `session-${metadata.userId}-${Date.now()}`;

      const result = await this.traceablePipeline(message, {
        metadata: {
          ...metadata,
          queryStartTime: queryStart,
          messageLength: message.length,
          // Thread identification as per LangSmith docs
          thread_id: threadId,
          session_id: threadId,
          conversation_id: threadId,
          user_id: metadata.userId,
          environment: metadata.environment,
        },
        tags: [
          // Core operation tags
          "rag-pipeline",
          "aws-knowledge-base",
          "chat-completion",

          // Context tags
          "thread-enabled",
          metadata.environment,

          // User classification
          `user:${metadata.userId}`,
          `session:${threadId.split("-").pop()}`, // Just timestamp part

          // Message characteristics
          `msg-length:${message.length > 100 ? "long" : message.length > 50 ? "medium" : "short"}`,
          `msg-count:${metadata.messageCount}`,

          // Performance tags
          "streaming",
          "retrieval-augmented",

          // Version tracking
          "v2.0.2",
        ],
      });

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
        stackTrace: error.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines of stack
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
      // AWS Knowledge Base provides page number in metadata
      const pageNumber = metadata["x-amz-bedrock-kb-document-page-number"];
      if (pageNumber && typeof pageNumber === "number" && pageNumber > 0) {
        return pageNumber;
      }

      // Try string conversion if it's a string
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
      // Try to extract page number from URI if it contains page information
      // This is a best-effort approach as page numbers might be embedded in different ways
      const pageMatch = uri.match(/page[_-]?(\d+)/i);
      if (pageMatch && pageMatch[1]) {
        return parseInt(pageMatch[1], 10);
      }

      // Default to page 1 if no page number is found
      return 1;
    } catch (error) {
      log("⚠️ [AWSKnowledgeBase] Failed to extract page number from URI", {
        uri,
      });
      return 1;
    }
  }
}
