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

  async initialize() {
    log("🚀 [AWSKnowledgeBaseProvider] Starting initialization with config", {
      knowledgeBaseId: this.knowledgeBaseId,
      region: backendConfig.rag.AWS_REGION,
      timestamp: new Date().toISOString(),
    });

    log("📊 [AWSKnowledgeBase] Creating traceable pipeline");

    // Create traced pipeline
    this.traceablePipeline = traceable(
      async (message: string) => {
        log("🔄 [AWSKnowledgeBase] Processing query", {
          messageLength: message.length,
        });

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

        log("🔍 [AWSKnowledgeBase] Querying knowledge base");
        const response = await this.client.send(command);

        log("📝 [AWSKnowledgeBase] Processing results", {
          resultCount: response.retrievalResults?.length || 0,
        });

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

        // Generate completion using Bedrock
        const stream = await this.chatService.createChatCompletion(
          [
            {
              role: "system",
              content:
                "You are a helpful assistant. Use the following context to answer the user's question. Do not include references in your response as they will be added automatically. If you cannot answer the question based on the context, say so.",
            },
            {
              role: "user",
              content: `Context: ${context?.map((c) => c.text).join("\n\n---\n\n")}\n\nQuestion: ${message}`,
            },
          ],
          {
            temperature: 0.7,
            max_tokens: 2000,
          },
        );

        return { stream, context };
      },
      {
        run_type: "chain",
        name: "AWS Knowledge Base RAG Query",
        tags: ["rag-query", "aws-knowledge-base", "chat"],
      },
    );

    log("✅ [AWSKnowledgeBase] Initialization complete");
  }

  async query(message: string, metadata: RAGMetadata): Promise<RAGResponse> {
    log("📝 [AWSKnowledgeBaseProvider] Query received", {
      messageLength: message.length,
      userId: metadata.userId,
      timestamp: new Date().toISOString(),
    });

    try {
      return this.traceablePipeline(message, {
        metadata,
        tags: [
          "rag-query",
          "aws-knowledge-base",
          "chat",
          metadata.environment,
          `user:${metadata.userId}`,
        ],
      });
    } catch (error) {
      err("❌ [AWSKnowledgeBaseProvider] Query error", {
        error: error.message,
        stage: "query",
        timestamp: new Date().toISOString(),
      });
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
