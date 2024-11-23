import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';

export class RAGService {
    private pc: Pinecone;
    private openai: OpenAI;
    private index: any;

    constructor() {
        console.debug('🔍 Initializing RAGService...');
        
        // Initialize OpenAI
        this.openai = new OpenAI({
            apiKey: import.meta.env.PUBLIC_OPENAI_API_KEY,
            dangerouslyAllowBrowser: true
        });

        // Initialize Pinecone with standard configuration
        this.pc = new Pinecone({
            apiKey: import.meta.env.PUBLIC_PINECONE_API_KEY,
        });

        this.index = this.pc.index("platform-engineering-rag");
    }

    async generateResponse(query: string): Promise<string> {
        try {
            // Generate embedding
            const embeddingResponse = await this.openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: query
            });
            
            const queryEmbedding = embeddingResponse.data[0].embedding;

            // Query Pinecone
            const queryResponse = await this.index.query({
                vector: queryEmbedding,
                topK: 3,
                includeValues: true,
                includeMetadata: true
            });

            if (!queryResponse.matches?.length) {
                return "I couldn't find any relevant information to answer your question.";
            }

            // Extract context
            const context = queryResponse.matches
                .map(match => match.metadata?.text)
                .filter(Boolean)
                .join('\n');

            // Generate final response
            const completion = await this.openai.chat.completions.create({
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

            return completion.choices[0].message.content;
        } catch (error) {
            console.error('❌ Error generating response:', error);
            throw error;
        }
    }
}
