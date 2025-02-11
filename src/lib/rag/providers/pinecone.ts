import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import type { RAGProvider, RAGResponse, RAGMetadata } from '../types';
import { traceable } from "langsmith/traceable";

export class PineconeRAGProvider implements RAGProvider {
    private openai: OpenAI;
    private pinecone: Pinecone;
    private traceablePipeline: any;

    constructor(openai: OpenAI) {
        console.log('🎯 [PineconeProvider] Constructor called');
        this.openai = openai;
    }

    async initialize() {
        console.log('🚀 [PineconeProvider] Starting initialization with config:', {
            indexName: Bun.env.PINECONE_INDEX_NAME,
            namespace: Bun.env.PINECONE_NAMESPACE,
            timestamp: new Date().toISOString()
        });
        
        this.pinecone = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        console.log('📊 [Pinecone] Creating traceable pipeline');
        
        // Create traced pipeline
        this.traceablePipeline = traceable(async (message: string) => {
            console.log('🔄 [Pinecone] Processing query:', { messageLength: message.length });
            
            const index = this.pinecone.index(Bun.env.PINECONE_INDEX_NAME as string)
                .namespace(Bun.env.PINECONE_NAMESPACE as string);

            console.log('🔤 [Pinecone] Generating embedding');
            const embeddingResponse = await this.openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: message
            });

            console.log('🔍 [Pinecone] Querying vector store');
            const queryResponse = await index.query({
                vector: embeddingResponse.data[0].embedding,
                topK: 3,
                includeMetadata: true
            });

            console.log('📝 [Pinecone] Processing matches:', {
                matchCount: queryResponse.matches?.length || 0
            });

            // Extract context
            const context = queryResponse.matches
                ?.map(match => ({
                    text: match.metadata?.text,
                    filename: match.metadata?.filename || 'Unknown source'
                }))
                .filter(item => item.text);

            // Generate completion
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
        }, {
            run_type: "chain",
            name: "Pinecone RAG Query",
            tags: ["rag-query", "pinecone", "chat"]
        });
        
        console.log('✅ [Pinecone] Initialization complete');
    }

    async query(message: string, metadata: RAGMetadata): Promise<RAGResponse> {
        console.log('📝 [PineconeProvider] Query received:', {
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
            console.error('❌ [PineconeProvider] Query error:', {
                error: error.message,
                stage: 'query',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
} 