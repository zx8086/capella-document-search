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

  private tracedKnowledgeBaseRetrieval = traceable(
    async (message: string) => {
      log("🔍 [AWSKnowledgeBase] Starting knowledge base retrieval", {
        messageLength: message.length,
        knowledgeBaseId: this.knowledgeBaseId,
      });

      try {
        const command = new RetrieveCommand({
          knowledgeBaseId: this.knowledgeBaseId,
          retrievalQuery: {
            text: message,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
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

        // Extract context from AWS Knowledge Base response
        const context =
          response.retrievalResults
            ?.map((result) => ({
              text: result.content?.text || "",
              filename: this.extractFilename(
                result.location?.s3Location?.uri || "Unknown source",
              ),
              pageNumber: this.extractPageNumber(
                result.location?.s3Location?.uri,
              ),
              chunkIndex: undefined, // AWS Knowledge Base doesn't provide chunk index
              metadata: {
                score: result.score,
                uri: result.location?.s3Location?.uri,
                type: result.location?.type,
                ...result.metadata,
              },
            }))
            .filter((item) => item.text.trim().length > 0) || [];

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
              content: `You are a helpful assistant. Use the following context to answer the user's question. Do not include references in your response as they will be added automatically. If you cannot answer the question based on the context, say so.

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

    // Create traced pipeline that orchestrates sub-components
    this.traceablePipeline = traceable(
      async (message: string) => {
        log("🔄 [AWSKnowledgeBase] Starting RAG pipeline", {
          messageLength: message.length,
        });

        const pipelineStartTime = Date.now();

        // Step 1: Knowledge Base Retrieval
        const { response, retrievalTime } =
          await this.tracedKnowledgeBaseRetrieval(message);

        // Step 2: Context Processing
        const { context, processingTime, totalChars, avgScore } =
          await this.tracedContextProcessing(response);

        // Step 3: LLM Completion
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
