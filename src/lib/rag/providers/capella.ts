import type { RAGProvider, RAGResponse, RAGMetadata } from '../types';
import OpenAI from 'openai';
import { Worker } from 'worker_threads';
import { log, err } from '$utils/unifiedLogger';
import { traceable } from "langsmith/traceable";
import { HfInference } from '@huggingface/inference';
import { dev } from '$app/environment';
import { backendConfig } from '../../../backend-config';

export class CapellaRAGProvider implements RAGProvider {
    private openai: OpenAI;
    private worker: Worker | null = null;
    private traceablePipeline: any;

    constructor(openai: OpenAI) {
        log('🎯 [CapellaProvider] Constructor called');
        this.openai = openai;
    }

    async initialize() {
        log('🚀 [CapellaProvider] Starting initialization');
        
        // Initialize worker
        this.worker = new Worker(new URL('../../../lib/services/couchbase-worker.ts', import.meta.url));
        
        log('📊 [Capella] Creating traceable pipeline');
        
        // Create traced pipeline
        this.traceablePipeline = traceable(async (message: string) => {
            try {
                log('🔄 [Capella] Processing query:', { messageLength: message.length });
                
                // Enhanced embedding logging
                log('🔤 [Capella] Generating embedding with OpenAI');
                const embeddingResponse = await this.openai.embeddings.create({
                    model: "text-embedding-3-large",
                    input: message,
                    encoding_format: "float",
                    dimensions: 3072
                });
                
                const vector = embeddingResponse.data[0].embedding;
                
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
                    filename: match.filename || 'Unknown source'
                })).filter(item => item.text) : [];

                // Generate completion using OpenAI
                const stream = await this.openai.chat.completions.create({
                    model: "gpt-4-turbo-preview",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant. Use the following context to answer the user's question. Always end your response with '\n\nReferences:' followed by the source filenames. If you cannot answer the question based on the context, say so."
                        },
                        {
                            role: "user",
                            content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nSource files: ${context?.map(c => c.filename).join(', ')}\n\nQuestion: ${message}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                    stream: true
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

    async query(message: string, metadata: RAGMetadata): Promise<RAGResponse> {
        log('📝 [CapellaProvider] Query received:', {
            messageLength: message.length,
            userId: metadata.userId
        });
        
        try {
            const result = await this.traceablePipeline(message, {
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