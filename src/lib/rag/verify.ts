/* src/lib/rag/verify.ts */

import { createRAGProvider } from './factory';

export async function verifyRAGSetup() {
    console.log('🔍 [RAG Verify] Starting verification');
    
    // Check environment variables only
    console.log('📋 [RAG Verify] Environment variables:', {
        RAG_PIPELINE: Bun.env.RAG_PIPELINE,
        PINECONE_API_KEY: Bun.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing',
        PINECONE_INDEX_NAME: Bun.env.PINECONE_INDEX_NAME,
        PINECONE_NAMESPACE: Bun.env.PINECONE_NAMESPACE,
        OPENAI_API_KEY: Bun.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing',
        COUCHBASE_VECTOR_INDEX: Bun.env.COUCHBASE_VECTOR_INDEX,
        NODE_ENV: Bun.env.NODE_ENV
    });

    // Don't attempt actual connection during verification
    console.log('✅ [RAG Verify] Environment check completed');
} 