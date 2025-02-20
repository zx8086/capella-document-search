import type { RAGProvider, RAGResponse, RAGMetadata } from '../types';
import OpenAI from 'openai';
import { Worker } from 'worker_threads';
import { log, err } from '$utils/unifiedLogger';
import { traceable } from "langsmith/traceable";
import { HfInference } from '@huggingface/inference';
import { dev } from '$app/environment';

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
                
                const hf = new HfInference("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");
                
                log('🔤 [Capella] Generating embedding');
                const response = await hf.featureExtraction({
                    model: "BAAI/bge-large-en-v1.5",
                    inputs: message
                });

                // Pad the vector to 4096 dimensions
                const vector = padVector(response, 4096);

                // Query vector store using worker
                log('🔍 [Capella] Querying vector store');
                const queryResponse = await new Promise((resolve, reject) => {
                    this.worker!.once('message', (result) => {
                        if (result.success) {
                            // Always resolve with an array, even if empty
                            resolve(result.results || []);
                        } else {
                            reject(new Error(result.error));
                        }
                    });

                    this.worker!.postMessage({ vector });
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
                err('❌ [Capella] Error in pipeline:', error);
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
            return this.traceablePipeline(message, {
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
        } catch (error) {
            err('❌ [CapellaProvider] Query error:', error);
            throw error;
        }
    }
}

function padVector(vector: number[], targetLength: number): number[] {
    if (vector.length >= targetLength) {
        return vector.slice(0, targetLength);
    }
    
    // Pad with zeros to reach target dimensions
    return [...vector, ...new Array(targetLength - vector.length).fill(0)];
} 