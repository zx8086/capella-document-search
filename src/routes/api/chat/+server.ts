import { json } from '@sveltejs/kit';
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import type { RequestHandler } from './$types';
import { traceable } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers";
import { get } from 'svelte/store';
import { userAccount, isAuthenticated } from '$lib/stores/authStore';

// console.log('🔑 Environment Variables:', {
//     OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
//     PINECONE_API_KEY: Bun.env.PINECONE_API_KEY
// });

// Initialize OpenAI with LangSmith tracing
const openai = wrapOpenAI(new OpenAI({
    apiKey: Bun.env.OPENAI_API_KEY
}));

// Wrap the RAG pipeline with tracing and metadata
const createRagPipeline = () => {
    return traceable(async (message: string) => {
        // Get current user information
        const user = get(userAccount);
        
        // Initialize Pinecone
        const pc = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        // Get index with specific namespace
        const index = pc.index(Bun.env.PINECONE_INDEX_NAME as string)
            .namespace(Bun.env.PINECONE_NAMESPACE as string);

        // Generate embedding
        console.log('🔄 Generating embedding...');
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: message
        });

        // Query Pinecone
        const queryResponse = await index.query({
            vector: embeddingResponse.data[0].embedding,
            topK: 3,
            includeMetadata: true
        });

        // Extract context
        const context = queryResponse.matches
            ?.map(match => ({
                text: match.metadata?.text,
                filename: match.metadata?.filename || 'Unknown source'
            }))
            .filter(item => item.text);

        // Generate completion
        const stream = await openai.chat.completions.create({
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
        name: "RAG Chat Query",
        tags: ["rag-query", "chat"],
        metadata: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            userId: user?.localAccountId || user?.homeAccountId || 'unknown',
            userEmail: user?.username || user?.email || 'unknown',
            userName: user?.name || 'unknown',
            timestamp: new Date().toISOString()
        }
    });
};

// Keep existing GET handler
export const GET: RequestHandler = async () => {
    try {
        const pc = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        const indexes = await pc.listIndexes();
        const index = pc.index(Bun.env.PINECONE_INDEX_NAME as string);
        const stats = await index.describeIndexStats();

        return json({
            indexes: indexes.map(idx => idx.name),
            currentIndex: {
                name: "platform-engineering-rag",
                stats: stats,
                dimensions: stats.dimension,
                totalVectors: stats.totalVectorCount,
                namespaces: stats.namespaces
            }
        });
    } catch (error) {
        console.error('❌ RAG Status Error:', error);
        return json({ error: 'Failed to get RAG status' }, { status: 500 });
    }
};

// Modify POST handler to use traced pipeline
export const POST: RequestHandler = async ({ request }) => {
    const { message, user } = await request.json();
    const startTime = Date.now();
    
    try {
        console.log('🔍 Server received user data:', user);

        const ragPipeline = traceable(async (message: string) => {
            // Initialize Pinecone
            const pc = new Pinecone({
                apiKey: Bun.env.PINECONE_API_KEY as string,
            });

            // Get index with specific namespace
            const index = pc.index(Bun.env.PINECONE_INDEX_NAME as string)
                .namespace(Bun.env.PINECONE_NAMESPACE as string);

            // Generate embedding
            console.log('🔄 Generating embedding...');
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: message
            });

            // Query Pinecone
            const queryResponse = await index.query({
                vector: embeddingResponse.data[0].embedding,
                topK: 3,
                includeMetadata: true
            });

            // Extract context
            const context = queryResponse.matches
                ?.map(match => ({
                    text: match.metadata?.text,
                    filename: match.metadata?.filename || 'Unknown source'
                }))
                .filter(item => item.text);

            // Generate completion
            const stream = await openai.chat.completions.create({
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
            name: "RAG Chat Query",
            tags: ["rag", "chat", user?.environment || 'unknown'],
            metadata: {
                // User Information
                userId: user?.id || 'anonymous',
                userName: user?.name || 'anonymous',
                userEmail: user?.email || 'anonymous',
                tenantId: user?.tenantId || 'unknown',
                isAuthenticated: user?.isAuthenticated || false,

                // Environment & Context
                environment: import.meta.env.DEV ? 'development' : 'production',
                pathname: user?.pathname || 'unknown',
                
                // Session Information
                sessionStartTime: user?.sessionStartTime,
                messageCount: user?.messageCount || 1,
                
                // Request Details
                clientTimestamp: user?.clientTimestamp,
                serverTimestamp: new Date().toISOString(),
                
                // Performance Metrics
                processingStartTime: startTime,
                
                // Message Details
                messageLength: message.length,
                
                // Feature Flags
                featureFlags: user?.featureFlags || {}
            }
        });

        const { stream, context } = await ragPipeline(message);

        // Now we can add context-related metrics to our logs
        console.log('📊 Query Context:', {
            contextSize: context?.length || 0,
            sourceFiles: context?.map(c => c.filename).join(', ')
        });

        return new Response(
            new ReadableStream({
                async start(controller) {
                    try {
                        let fullResponse = '';
                        
                        for await (const chunk of stream) {
                            const content = chunk.choices[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        JSON.stringify({ content }) + '\n'
                                    )
                                );
                            }
                        }

                        if (!fullResponse.includes('References:')) {
                            const references = `\n\nReferences:\n${context?.map(c => c.filename).join('\n- ')}`;
                            controller.enqueue(
                                new TextEncoder().encode(
                                    JSON.stringify({ content: references }) + '\n'
                                )
                            );
                        }

                        controller.enqueue(
                            new TextEncoder().encode(
                                JSON.stringify({ done: true }) + '\n'
                            )
                        );
                        controller.close();
                    } catch (error) {
                        console.error("❌ Stream processing error:", error);
                        controller.error(error);
                    }
                }
            }),
            {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Content-Type-Options": "nosniff"
                }
            }
        );

    } catch (error) {
        // Add error tracking
        console.error('❌ Chat API Error:', {
            error: error.message,
            userId: user?.id,
            timestamp: new Date().toISOString(),
            message: message.substring(0, 100) // First 100 chars for context
        });
        throw error;
    }
};