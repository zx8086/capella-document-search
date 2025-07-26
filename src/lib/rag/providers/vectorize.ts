/* src/lib/rag/providers/vectorize.ts */

import type { RAGProvider, RAGResponse, RAGMetadata, ConversationMessage } from '../types';
import { traceable } from "langsmith/traceable";
import { BedrockEmbeddingService } from '../../services/bedrock-embedding';
import { BedrockChatService } from '../../services/bedrock-chat';
import { backendConfig } from '../../../backend-config';

export class VectorizeRAGProvider implements RAGProvider {
    private embeddingService: BedrockEmbeddingService;
    private chatService: BedrockChatService;
    private traceablePipeline: any;

    constructor() {
        this.embeddingService = new BedrockEmbeddingService(backendConfig.rag.AWS_REGION);
        this.chatService = new BedrockChatService(backendConfig.rag.AWS_REGION);
    }

    async initialize() {
        // Mock initialization for Vectorize
        console.log('🔄 Initializing Vectorize provider...');

        // Create traced pipeline
        this.traceablePipeline = traceable(async (message: string, messages?: ConversationMessage[]) => {
            // Generate embedding using Bedrock
            console.log('🔄 Generating embedding...');
            const embedding = await this.embeddingService.createEmbedding(message);

            // Mock Vectorize query
            // In reality, this would be your Vectorize-specific implementation
            console.log('🔍 Querying Vectorize...');
            const mockVectorizeResponse = {
                matches: [
                    {
                        metadata: {
                            text: "This is a mock response from Vectorize",
                            filename: "mock_file_1.md"
                        },
                        score: 0.95
                    },
                    {
                        metadata: {
                            text: "Another mock response from Vectorize",
                            filename: "mock_file_2.md"
                        },
                        score: 0.85
                    }
                ]
            };

            // Extract context (similar to Pinecone implementation)
            const context = mockVectorizeResponse.matches
                .map(match => ({
                    text: match.metadata.text,
                    filename: match.metadata.filename || 'Unknown source'
                }))
                .filter(item => item.text);

            // Build conversation messages with context
            const systemMessage = {
                role: "system",
                content: "You are a helpful assistant. Use the following context to answer the user's question. Always end your response with '\n\nReferences:' followed by the source filenames. If you cannot answer the question based on the context, say so."
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
                        content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nSource files: ${context?.map(c => c.filename).join(', ')}\n\nQuestion: ${message}`
                    });
                }
            } else {
                // No conversation history, use the traditional format
                conversationMessages = [
                    systemMessage,
                    {
                        role: "user",
                        content: `Context: ${context?.map(c => c.text).join('\n\n---\n\n')}\n\nSource files: ${context?.map(c => c.filename).join(', ')}\n\nQuestion: ${message}`
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
            name: "Vectorize RAG Query",
            tags: ["rag-query", "vectorize", "chat"]
        });
    }

    async query(message: string, metadata: RAGMetadata, messages?: ConversationMessage[]): Promise<RAGResponse> {
        try {
            return this.traceablePipeline(message, messages, {
                metadata,
                tags: [
                    "rag-query",
                    "vectorize",
                    "chat",
                    metadata.environment,
                    `user:${metadata.userId}`
                ]
            });
        } catch (error) {
            console.error('❌ Vectorize RAG Error:', {
                error: error.message,
                stage: 'query',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}

