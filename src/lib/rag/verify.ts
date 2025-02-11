/* src/lib/rag/verify.ts */

import { createRAGProvider } from './factory';

export async function verifyRAGSetup() {
    console.log('🔍 [RAG Verify] Starting verification');
    
    // Check environment variables
    console.log('📋 [RAG Verify] Environment variables:', {
        RAG_PIPELINE: Bun.env.RAG_PIPELINE,
        PINECONE_API_KEY: Bun.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing',
        PINECONE_INDEX_NAME: Bun.env.PINECONE_INDEX_NAME,
        PINECONE_NAMESPACE: Bun.env.PINECONE_NAMESPACE,
        OPENAI_API_KEY: Bun.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing',
        NODE_ENV: Bun.env.NODE_ENV
    });

    try {
        const provider = createRAGProvider();
        console.log('✅ [RAG Verify] Provider created:', {
            type: provider.constructor.name
        });
        
        await provider.initialize();
        console.log('✅ [RAG Verify] Provider initialized');
        
    } catch (error) {
        console.error('❌ [RAG Verify] Setup failed:', error);
    }
} 