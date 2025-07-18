/* src/lib/rag/factory.ts */

import type { RAGProvider } from './types';
import { PineconeRAGProvider } from './providers/pinecone';
import { VectorizeRAGProvider } from './providers/vectorize';
import { CapellaRAGProvider } from './providers/capella';
import { log, err } from '../../utils/unifiedLogger';

export function createRAGProvider(fetch: typeof fetch): RAGProvider {
    // Add immediate environment check
    log('🔎 [RAG Factory] Environment check', {
        RAG_PIPELINE: Bun.env.RAG_PIPELINE,
        NODE_ENV: Bun.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });

    const pipeline = Bun.env.RAG_PIPELINE?.toUpperCase() || 'PINECONE';
    
    log('🏭 [RAG Factory] Creating provider', {
        selectedPipeline: pipeline,
        rawEnvValue: Bun.env.RAG_PIPELINE,
        timestamp: new Date().toISOString()
    });
    
    let provider: RAGProvider;
    
    switch (pipeline) {
        case 'PINECONE':
            log('📌 [RAG Factory] Creating Pinecone provider instance');
            provider = new PineconeRAGProvider();
            break;
        case 'VECTORIZE':
            log('🔍 [RAG Factory] Creating Vectorize provider instance');
            provider = new VectorizeRAGProvider();
            break;
        case 'CAPELLA':
            log('🔍 [RAG Factory] Creating Capella provider instance');
            provider = new CapellaRAGProvider();
            break;
        default:
            err('❌ [RAG Factory] Unsupported pipeline', { pipeline });
            throw new Error(`Unsupported RAG pipeline: ${pipeline}`);
    }
    
    log('✅ [RAG Factory] Provider created', {
        type: pipeline,
        providerClass: provider.constructor.name,
        timestamp: new Date().toISOString()
    });
    
    return provider;
} 