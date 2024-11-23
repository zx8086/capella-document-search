import { json } from '@sveltejs/kit';
import { Pinecone } from "@pinecone-database/pinecone";
import type { RequestHandler } from './$types';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: import.meta.env.PUBLIC_OPENAI_API_KEY
});

// Initialize Pinecone client
const pc = new Pinecone({
    apiKey: import.meta.env.PUBLIC_PINECONE_API_KEY
});

// Helper function to get embeddings from OpenAI
async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text
        });
        
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw new Error('Failed to generate embedding');
    }
}

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { query } = await request.json();
        
        // Get the embedding for the query
        const queryEmbedding = await getEmbedding(query);
        
        // Initialize Pinecone index
        const index = pc.index("platform-engineering-rag");
        
        // Query Pinecone with the embedding
        const queryResponse = await index.query({
            vector: queryEmbedding,
            topK: 3,
            includeValues: true,
            includeMetadata: true
        });

        if (!queryResponse.matches?.length) {
            return json({
                response: "I couldn't find any relevant information to answer your question."
            });
        }

        // Extract and combine the relevant context
        const context = queryResponse.matches
            .map(match => match.metadata?.text)
            .filter(Boolean)
            .join('\n');

        // Generate final response using OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant. Use the following context to answer the user's question. If you cannot answer the question based on the context, say so."
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${query}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        return json({
            response: completion.choices[0].message.content
        });

    } catch (error) {
        console.error('RAG API Error:', error);
        return json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}; 