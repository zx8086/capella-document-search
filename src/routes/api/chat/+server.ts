import { json } from '@sveltejs/kit';
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import type { RequestHandler } from './$types';

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: import.meta.env.PUBLIC_OPENAI_API_KEY
});

// Keep existing GET handler
export const GET: RequestHandler = async () => {
    try {
        const pc = new Pinecone({
            apiKey: import.meta.env.PUBLIC_PINECONE_API_KEY,
        });

        const indexes = await pc.listIndexes();
        const index = pc.index("platform-engineering-rag");
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
    try {
        const { message } = await request.json();
        console.log('📨 Received chat request:', { message });

        // Initialize Pinecone
        const pc = new Pinecone({
            apiKey: import.meta.env.PUBLIC_PINECONE_API_KEY,
        });

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

        // Query Pinecone
        console.log('🔄 Querying Pinecone...');
        const index = pc.index("platform-engineering-rag");
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
                response: "I couldn't find any relevant information to answer your question.",
                debug: {
                    matchCount: 0,
                    contextLength: 0,
                    topMatchScores: []
                }
            });
        }

        // Extract context
        const context = queryResponse.matches
            .map(match => match.metadata?.text)
            .filter(Boolean)
            .join('\n\n---\n\n');

        console.log('📝 Context details:', {
            contextLength: context.length,
            matchCount: queryResponse.matches.length,
            topMatchScores: queryResponse.matches.map(m => m.score)
        });

        // Generate completion
        console.log('🔄 Requesting GPT completion...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say so."
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${message}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        console.log('✅ GPT response received:', {
            tokens: completion.usage,
            model: completion.model,
            responsePreview: completion.choices[0].message.content.slice(0, 100) + '...'
        });

        return json({
            response: completion.choices[0].message.content,
            debug: {
                matchCount: queryResponse.matches.length,
                contextLength: context.length,
                topMatchScores: queryResponse.matches.map(m => m.score)
            }
        });

    } catch (error) {
        console.error('❌ Chat API Error:', {
            error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                stack: error.stack
            } : error,
            timestamp: new Date().toISOString()
        });
        return json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
};