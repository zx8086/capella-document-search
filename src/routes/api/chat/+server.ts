/* src/routes/api/chat/+server.ts */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRAGProvider } from '$lib/rag/factory';
import type { RAGMetadata } from '$lib/rag/types';
import { verifyRAGSetup } from '$lib/rag/verify';
import { log, err } from '$utils/unifiedLogger';
import { dev } from '$app/environment';

// Initialize provider lazily
let ragProvider: any = null;

export const POST: RequestHandler = async ({ fetch, request }) => {
    const startTime = Date.now();
    log('📥 [Server] Received request');
    
    try {
        // Initialize provider with fetch
        if (!ragProvider) {
            log('🌟 [Server] Starting RAG system initialization');
            ragProvider = createRAGProvider(fetch);
            log('⚙️ [Server] Provider instance created:', {
                type: ragProvider.constructor.name
            });

            await ragProvider.initialize();
            log('✅ [Server] RAG system initialized:', {
                provider: Bun.env.RAG_PIPELINE,
                timestamp: new Date().toISOString()
            });
        }

        const { message, user } = await request.json();
        
        log('📨 [Server] Processing chat request:', {
            messageLength: message.length,
            userId: user?.id,
            provider: Bun.env.RAG_PIPELINE,
            timestamp: new Date().toISOString()
        });
        
        console.log('🔍 Server received user data:', user);

        // Prepare metadata for tracing
        const metadata: RAGMetadata = {
            // User Information
            userId: user?.id || 'anonymous',
            userName: user?.name || 'anonymous',
            userEmail: user?.email || 'anonymous',
            tenantId: user?.tenantId || 'unknown',
            isAuthenticated: user?.isAuthenticated || false,

            // Environment & Context
            environment: dev ? 'development' : 'production',
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
            
        };

        log('🔄 [Server] Executing RAG query');
        const { stream, context } = await ragProvider.query(message, metadata);

        log('✅ [Server] Query completed:', {
            contextSize: context?.length || 0,
            processingTime: Date.now() - startTime,
            provider: Bun.env.RAG_PIPELINE,
            sourceFiles: context?.map(c => c.filename).join(', ')
        });

        // Log context metrics
        log('📊 Query Context:', {
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
                        log('❌ Stream processing error:', error);
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
        err('❌ [Server] Error in chat API:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
};