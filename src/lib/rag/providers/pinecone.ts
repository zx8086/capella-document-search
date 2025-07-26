/* src/lib/rag/providers/pinecone.ts */

import { Pinecone } from "@pinecone-database/pinecone";
import type { RAGProvider, RAGResponse, RAGMetadata, ConversationMessage } from '../types';
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
        this.traceablePipeline = traceable(async (message: string, messages?: ConversationMessage[]) => {
            log('🔄 [Pinecone] Processing query', { 
                messageLength: message.length,
                hasConversationHistory: !!(messages && messages.length > 0),
                conversationLength: messages?.length || 0
            });
            
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

            // Build conversation messages with context
            const systemMessage = {
                role: "system",
                content: "You are a helpful assistant. Use the following context to answer the user's question. Do not include references in your response as they will be added automatically. If you cannot answer the question based on the context, say so."
            };

            let conversationMessages = [];
            
            if (messages && messages.length > 0) {
                // Add system message first
                conversationMessages.push(systemMessage);
                
                // Add all conversation messages
                conversationMessages.push(...messages);
                
                // If the last message doesn't match our current message, add it with context
                const lastMessage = messages[messages.length - 1];
                if (!lastMessage || lastMessage.content !== message) {
                    conversationMessages.push({
                        role: "user",
                        content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nQuestion: ${message}`
                    });
                }
            } else {
                // No conversation history, use the traditional format
                conversationMessages = [
                    systemMessage,
                    {
                        role: "user",
                        content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nQuestion: ${message}`
                    }
                ];
            }

            // Generate completion using Bedrock with full conversation
            const stream = await this.chatService.createChatCompletion(conversationMessages, {
                temperature: 0.7,
                max_tokens: 4096  // Increased to allow for longer responses
            });

            return { stream, context };
        }, {
            run_type: "chain",
            name: "Pinecone RAG Query",
            tags: ["rag-query", "pinecone", "chat"]
        });
        
        log('✅ [Pinecone] Initialization complete');
    }

    async query(message: string, metadata: RAGMetadata, messages?: ConversationMessage[]): Promise<RAGResponse> {
        log('📝 [PineconeProvider] Query received', {
            messageLength: message.length,
            userId: metadata.userId,
            timestamp: new Date().toISOString(),
            hasConversationHistory: !!(messages && messages.length > 0),
            conversationLength: messages?.length || 0
        });
        
        try {
            return this.traceablePipeline(message, messages, {
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