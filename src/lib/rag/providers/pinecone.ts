/* src/lib/rag/providers/pinecone.ts */

import { Pinecone } from "@pinecone-database/pinecone";
import type { RAGProvider, RAGResponse, RAGMetadata } from '../types';
import { traceable } from "langsmith/traceable";
import { BedrockEmbeddingService } from '../../services/bedrock-embedding';
import { BedrockChatService } from '../../services/bedrock-chat';
import { backendConfig } from '../../../backend-config';
import { log, err } from '../../../utils/unifiedLogger';

export class PineconeRAGProvider implements RAGProvider {
    private embeddingService: BedrockEmbeddingService;
    private chatService: BedrockChatService;
    private pinecone: Pinecone;
    private traceablePipeline: any;

    constructor() {
        log('🎯 [PineconeProvider] Constructor called');
        this.embeddingService = new BedrockEmbeddingService(backendConfig.rag.AWS_REGION);
        this.chatService = new BedrockChatService(backendConfig.rag.AWS_REGION);
    }

    async initialize() {
        log('🚀 [PineconeProvider] Starting initialization with config', {
            indexName: Bun.env.PINECONE_INDEX_NAME,
            namespace: Bun.env.PINECONE_NAMESPACE,
            timestamp: new Date().toISOString()
        });
        
        this.pinecone = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        log('📊 [Pinecone] Creating traceable pipeline');
        
        // Create traced pipeline
        this.traceablePipeline = traceable(async (message: string) => {
            log('🔄 [Pinecone] Processing query', { messageLength: message.length });
            
            const index = this.pinecone.index(Bun.env.PINECONE_INDEX_NAME as string)
                .namespace(Bun.env.PINECONE_NAMESPACE as string);

            log('🔤 [Pinecone] Generating embedding with Bedrock');
            const embedding = await this.embeddingService.createEmbedding(message);

            log('🔍 [Pinecone] Querying vector store');
            const queryResponse = await index.query({
                vector: embedding,
                topK: 3,
                includeMetadata: true
            });

            log('📝 [Pinecone] Processing matches', {
                matchCount: queryResponse.matches?.length || 0
            });

            // Extract context
            const context = queryResponse.matches
                ?.map(match => ({
                    text: match.metadata?.text,
                    filename: match.metadata?.filename || 'Unknown source',
                    pageNumber: match.metadata?.page || match.metadata?.pageNumber || match.metadata?.page_number || match.metadata?.pageNum,
                    chunkIndex: match.metadata?.chunkIndex || match.metadata?.chunk || match.metadata?.chunk_index || match.metadata?.index,
                    metadata: match.metadata
                }))
                .filter(item => item.text);

            // Generate completion using Bedrock
            const stream = await this.chatService.createChatCompletion([
                {
                    role: "system",
                    content: "You are a helpful assistant. Use the following context to answer the user's question. Do not include references in your response as they will be added automatically. If you cannot answer the question based on the context, say so."
                },
                {
                    role: "user",
                    content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nQuestion: ${message}`
                }
            ], {
                temperature: 0.7,
                max_tokens: 2000
            });

            return { stream, context };
        }, {
            run_type: "chain",
            name: "Pinecone RAG Query",
            tags: ["rag-query", "pinecone", "chat"]
        });
        
        log('✅ [Pinecone] Initialization complete');
    }

    async query(message: string, metadata: RAGMetadata): Promise<RAGResponse> {
        log('📝 [PineconeProvider] Query received', {
            messageLength: message.length,
            userId: metadata.userId,
            timestamp: new Date().toISOString()
        });
        
        try {
            return this.traceablePipeline(message, {
                metadata,
                tags: [
                    "rag-query",
                    "pinecone",
                    "chat",
                    metadata.environment,
                    `user:${metadata.userId}`
                ]
            });
        } catch (error) {
            err('❌ [PineconeProvider] Query error', {
                error: error.message,
                stage: 'query',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
} 