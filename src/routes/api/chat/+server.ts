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

        // Debug: Log full context to see available metadata
        if (context && context.length > 0) {
            log('🔍 [Debug] Context metadata:', {
                firstContext: {
                    filename: context[0].filename,
                    pageNumber: context[0].pageNumber,
                    chunkIndex: context[0].chunkIndex,
                    hasMetadata: !!context[0].metadata,
                    metadataKeys: context[0].metadata ? Object.keys(context[0].metadata) : []
                }
            });
        }

        return new Response(
            new ReadableStream({
                async start(controller) {
                    try {
                        let fullResponse = '';
                        
                        log('🌊 [Server] Starting to read stream');
                        let chunkCount = 0;
                        for await (const chunk of stream) {
                            chunkCount++;
                            log(`🔢 [Server] Processing chunk #${chunkCount}`);
                            // Handle both OpenAI and Bedrock response formats
                            let content = '';
                            
                            if (typeof chunk === 'string') {
                                // Bedrock format - chunk is already a string
                                content = chunk;
                                log('📤 [Server] Bedrock chunk:', { 
                                    chunkType: 'string', 
                                    length: content.length,
                                    preview: content.substring(0, 50)
                                });
                            } else if (chunk.choices && chunk.choices[0]?.delta?.content) {
                                // OpenAI format - extract from choices
                                content = chunk.choices[0].delta.content;
                                log('📤 [Server] OpenAI chunk:', { 
                                    chunkType: 'object', 
                                    length: content.length 
                                });
                            }
                            
                            if (content) {
                                fullResponse += content;
                                const jsonLine = JSON.stringify({ content }) + '\n';
                                controller.enqueue(new TextEncoder().encode(jsonLine));
                                log('📨 [Server] Sent to client:', { 
                                    jsonLine: jsonLine.trim(),
                                    totalResponseLength: fullResponse.length 
                                });
                            }
                        }
                        
                        log('🛑 [Server] Stream iteration complete', {
                            totalChunks: chunkCount,
                            responseLength: fullResponse.length
                        });

                        // Always append page-numbered references, replacing any existing basic references
                        const sourceReferences = context?.slice(0, 3)
                            .map(c => ({
                                filename: c.filename || "Unknown",
                                pageNumber: c.pageNumber || 1,
                                score: 0 // We don't have score in context, but keeping structure consistent
                            }))
                            .filter((source, index, self) => 
                                // Remove duplicates by page number
                                index === self.findIndex(s => s.pageNumber === source.pageNumber)
                            )
                            .sort((a, b) => a.pageNumber - b.pageNumber) || [];

                        log('🔍 [Debug] Source references processing:', {
                            contextLength: context?.length || 0,
                            sourceReferencesLength: sourceReferences.length,
                            sourceReferences: sourceReferences,
                            hasReferencesInResponse: fullResponse.includes('References:')
                        });

                        // Remove any basic "References:" section from the AI response and replace with page-numbered version
                        let processedResponse = fullResponse;
                        
                        // Simple approach: find the last occurrence of "References:" and remove everything after it
                        const referencesIndex = processedResponse.lastIndexOf('References:');
                        log('🔍 [Debug] References processing:', {
                            referencesIndex,
                            originalLength: fullResponse.length,
                            foundReferences: referencesIndex !== -1
                        });
                        
                        if (referencesIndex !== -1) {
                            processedResponse = processedResponse.substring(0, referencesIndex).trim();
                            log('🔍 [Debug] Processed response after removing references:', {
                                newLength: processedResponse.length,
                                wasModified: processedResponse !== fullResponse
                            });
                        }

                        const enhancedReferences = sourceReferences.length > 0 
                            ? `\n\nReferences:\n${sourceReferences
                                .map(ref => `${ref.filename} (Page ${ref.pageNumber})`)
                                .join('\n')}`
                            : `\n\nReferences:\n${context?.slice(0, 3).map(c => c.filename).join('\n')}`;
                        
                        // Send the processed response without basic references
                        if (processedResponse !== fullResponse) {
                            // Response was modified, send the corrected content
                            controller.enqueue(
                                new TextEncoder().encode(
                                    JSON.stringify({ content: processedResponse + enhancedReferences }) + '\n'
                                )
                            );
                        } else {
                            // No modification needed, just append enhanced references
                            controller.enqueue(
                                new TextEncoder().encode(
                                    JSON.stringify({ content: enhancedReferences }) + '\n'
                                )
                            );
                        }

                        const doneMessage = JSON.stringify({ done: true }) + '\n';
                        controller.enqueue(new TextEncoder().encode(doneMessage));
                        log('🏁 [Server] Sent done signal:', { 
                            doneMessage: doneMessage.trim(),
                            finalResponseLength: fullResponse.length 
                        });
                        controller.close();
                        log('🔒 [Server] Stream closed');
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