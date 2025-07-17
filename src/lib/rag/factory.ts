/* src/lib/rag/factory.ts */

import type { RAGProvider } from './types';
import { PineconeRAGProvider } from './providers/pinecone';
import { VectorizeRAGProvider } from './providers/vectorize';
import { CapellaRAGProvider } from './providers/capella';

export function createRAGProvider(fetch: typeof fetch): RAGProvider {
    // Add immediate environment check
    console.log('🔎 [RAG Factory] Environment check:', {
        RAG_PIPELINE: Bun.env.RAG_PIPELINE,
        NODE_ENV: Bun.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });

    const pipeline = Bun.env.RAG_PIPELINE?.toUpperCase() || 'PINECONE';
    
    console.log('🏭 [RAG Factory] Creating provider:', {
        selectedPipeline: pipeline,
        rawEnvValue: Bun.env.RAG_PIPELINE,
        timestamp: new Date().toISOString()
    });
    
    let provider: RAGProvider;
    
    switch (pipeline) {
        case 'PINECONE':
            console.log('📌 [RAG Factory] Creating Pinecone provider instance');
            provider = new PineconeRAGProvider();
            break;
        case 'VECTORIZE':
            console.log('🔍 [RAG Factory] Creating Vectorize provider instance');
            provider = new VectorizeRAGProvider();
            break;
        case 'CAPELLA':
            console.log('🔍 [RAG Factory] Creating Capella provider instance');
            provider = new CapellaRAGProvider();
            break;
        default:
            console.error('❌ [RAG Factory] Unsupported pipeline:', pipeline);
            throw new Error(`Unsupported RAG pipeline: ${pipeline}`);
    }
    
    console.log('✅ [RAG Factory] Provider created:', {
        type: pipeline,
        providerClass: provider.constructor.name,
        timestamp: new Date().toISOString()
    });
    
    return provider;
} 