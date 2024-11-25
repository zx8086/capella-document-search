import { json } from '@sveltejs/kit';
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import type { RequestHandler } from './$types';

console.log('🔑 Environment Variables:', {
    OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
    PINECONE_API_KEY: Bun.env.PINECONE_API_KEY
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: Bun.env.OPENAI_API_KEY
});

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

// Add POST handler for chat
export const POST: RequestHandler = async ({ request }) => {
    const { message } = await request.json();
    
    try {
        // Initialize Pinecone with correct host URL
        const pc = new Pinecone({
            apiKey: Bun.env.PINECONE_API_KEY as string,
        });

        // Get index with specific namespace
        const index = pc.index(Bun.env.PINECONE_INDEX_NAME as string).namespace(Bun.env.PINECONE_NAMESPACE as string);

        // Generate embedding
        console.log('🔄 Generating embedding...');
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: message
        });
        console.log('✅ Embedding details:', {
            dimensions: embeddingResponse.data[0].embedding.length,
            embedding: `${embeddingResponse.data[0].embedding.slice(0, 3)}...`
        });

        // Query within that namespace
        console.log('🔄 Querying Pinecone...', {
            indexName: "platform-engineering-rag",
            namespace: "capella-document-search",
            vectorDimensions: embeddingResponse.data[0].embedding.length
        });

        const queryResponse = await index.query({
            vector: embeddingResponse.data[0].embedding,
            topK: 3,
            includeMetadata: true
        });

        console.log('📊 Pinecone matches:', {
            totalMatches: queryResponse.matches?.length,
            matches: queryResponse.matches?.map(m => ({
                score: m.score,
                metadata: m.metadata,
                id: m.id
            }))
        });

        if (!queryResponse.matches?.length) {
            console.warn('⚠️ No matches found in Pinecone');
            return json({
                response: "I couldn't find any relevant information to answer your question."
            });
        }

        // Extract context
        const context = queryResponse.matches
            .map(match => ({
                text: match.metadata?.text,
                filename: match.metadata?.filename || 'Unknown source'
            }))
            .filter(item => item.text);

        console.log('📝 Context details:', {
            contextLength: context.length,
            matchCount: queryResponse.matches.length,
            topMatchScores: queryResponse.matches.map(m => m.score)
        });

        console.log('🔍 Using RAG Context:', {
            question: message,
            retrievedContext: context.map(c => c.text).join('\n\n---\n\n'),
            similarityScore: queryResponse.matches[0].score
        });

        const stream = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant. Use the following context to answer the user's question. Always end your response with '\n\nReferences:' followed by the source filenames. If you cannot answer the question based on the context, say so."
                },
                {
                    role: "user",
                    content: `Context: ${context.map(c => c.text).join('\n\n---\n\n')}\n\nSource files: ${context.map(c => c.filename).join(', ')}\n\nQuestion: ${message}`
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            stream: true
        });

        // After the response, append the references if they're not already included
        let fullResponse = '';

        // Match the working implementation's response structure
        return new Response(
            new ReadableStream({
                async start(controller) {
                    try {
                        for await (const chunk of stream) {
                            const content = chunk.choices[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;
                                // Send each chunk as a JSON string with newline delimiter
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        JSON.stringify({ content }) + '\n'
                                    )
                                );
                            }
                        }

                        // If response doesn't include references, append them
                        if (!fullResponse.includes('References:')) {
                            const references = `\n\nReferences:\n${context.map(c => c.filename).join('\n- ')}`;
                            controller.enqueue(
                                new TextEncoder().encode(
                                    JSON.stringify({ content: references }) + '\n'
                                )
                            );
                        }

                        // Send done signal
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
        console.error('❌ Chat API Error:', error);
        return new Response(
            JSON.stringify({ 
                error: "Internal server error",
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }), 
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
};