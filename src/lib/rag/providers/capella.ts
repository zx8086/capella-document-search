/* src/lib/rag/providers/capella.ts */

import type { RAGProvider, RAGResponse, RAGMetadata, ConversationMessage } from '../types';
import { Worker } from 'worker_threads';
import { log, err } from '$utils/unifiedLogger';
import { traceable } from "langsmith/traceable";
import { HfInference } from '@huggingface/inference';
import { dev } from '$app/environment';
import { backendConfig } from '../../../backend-config';
import { BedrockEmbeddingService } from '../../services/bedrock-embedding';
import { BedrockChatService } from '../../services/bedrock-chat';

export class CapellaRAGProvider implements RAGProvider {
    private embeddingService: BedrockEmbeddingService;
    private chatService: BedrockChatService;
    private worker: Worker | null = null;
    private traceablePipeline: any;

    constructor() {
        log('🎯 [CapellaProvider] Constructor called');
        this.embeddingService = new BedrockEmbeddingService(backendConfig.rag.AWS_REGION);
        this.chatService = new BedrockChatService(backendConfig.rag.AWS_REGION);
    }

    async initialize() {
        log('🚀 [CapellaProvider] Starting initialization');
        
        // Initialize worker
        this.worker = new Worker(new URL('../../../lib/services/couchbase-worker.ts', import.meta.url));
        
        log('📊 [Capella] Creating traceable pipeline');
        
        // Create traced pipeline
        this.traceablePipeline = traceable(async (message: string, messages?: ConversationMessage[]) => {
            try {
                log('🔄 [Capella] Processing query:', { 
                    messageLength: message.length,
                    hasConversationHistory: !!(messages && messages.length > 0),
                    conversationLength: messages?.length || 0
                });
                
                // Enhanced embedding logging
                log('🔤 [Capella] Generating embedding with Bedrock');
                const vector = await this.embeddingService.createEmbedding(message);
                
                // Log vector details
                log('📊 [Capella] Embedding generated:', {
                    vectorLength: vector.length,
                    vectorSample: {
                        first5: vector.slice(0, 5),
                        last5: vector.slice(-5),
                        min: Math.min(...vector),
                        max: Math.max(...vector),
                        avg: vector.reduce((a, b) => a + b, 0) / vector.length
                    }
                });

                // Query vector store using worker
                log('🔍 [Capella] Querying vector store with dimensions:', vector.length);
                const queryResponse = await new Promise((resolve, reject) => {
                    if (!this.worker) {
                        reject(new Error('Worker not initialized'));
                        return;
                    }

                    const messageHandler = (result: any) => {
                        this.worker!.removeListener('message', messageHandler);
                        if (result.success) {
                            log('✅ [Capella] Vector search completed:', {
                                resultCount: result.results?.length || 0,
                                firstResult: result.results?.[0]?.score
                            });
                            resolve(result.results || []);
                        } else {
                            err('❌ [Capella] Vector search failed:', result.error);
                            reject(new Error(result.error));
                        }
                    };

                    this.worker.once('message', messageHandler);
                    this.worker.postMessage({ vector });
                });

                log('📝 [Capella] Processing matches');
                // Ensure we always return an array
                const context = Array.isArray(queryResponse) ? queryResponse.map(match => ({
                    text: match.text,
                    filename: match.filename || 'Unknown source',
                    pageNumber: match.metadata?.page || match.metadata?.pageNumber || match.metadata?.page_number || match.metadata?.pageNum,
                    chunkIndex: match.metadata?.chunkIndex || match.metadata?.chunk || match.metadata?.chunk_index || match.metadata?.index,
                    metadata: match.metadata
                })).filter(item => item.text) : [];

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
                    max_tokens: backendConfig.rag.BEDROCK_MAX_TOKENS
                });

                return { stream, context };
            } catch (error) {
                err('❌ [Capella] Error in pipeline:', {
                    error: error.message,
                    stack: error.stack,
                    phase: 'embedding_generation'
                });
                throw error;
            }
        }, {
            run_type: "chain",
            name: "Capella RAG Query",
            tags: ["rag-query", "capella", "chat"]
        });
        
        log('✅ [Capella] Initialization complete');
    }

    async query(message: string, metadata: RAGMetadata, messages?: ConversationMessage[]): Promise<RAGResponse> {
        log('📝 [CapellaProvider] Query received:', {
            messageLength: message.length,
            userId: metadata.userId,
            hasConversationHistory: !!(messages && messages.length > 0),
            conversationLength: messages?.length || 0
        });
        
        try {
            const result = await this.traceablePipeline(message, messages, {
                metadata,
                tags: [
                    "rag-query",
                    "capella",
                    "chat",
                    metadata.environment,
                    `user:${metadata.userId}`,
                    dev ? 'development' : 'production'
                ]
            });

            // Add metrics to the trace
            if (result.metrics) {
                log('📊 [CapellaProvider] Search metrics:', result.metrics);
            }

            return result;
        } catch (error) {
            err('❌ [CapellaProvider] Query error:', error);
            // Enhance error handling based on worker response
            if (error.retryable) {
                // Implement retry logic if needed
                log('🔄 [CapellaProvider] Error is retryable');
            }
            throw error;
        }
    }
} 