/* src/lib/rag/factory.ts */

import type { RAGProvider } from './types';
import { PineconeRAGProvider } from './providers/pinecone';
import { VectorizeRAGProvider } from './providers/vectorize';
import OpenAI from 'openai';
import { wrapOpenAI } from "langsmith/wrappers";

export function createRAGProvider(): RAGProvider {
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
    
    // Initialize OpenAI with LangSmith tracing
    const openai = wrapOpenAI(new OpenAI({
        apiKey: Bun.env.OPENAI_API_KEY
    }));
    
    let provider: RAGProvider;
    
    switch (pipeline) {
        case 'PINECONE':
            console.log('📌 [RAG Factory] Creating Pinecone provider instance');
            provider = new PineconeRAGProvider(openai);
            break;
        case 'VECTORIZE':
            console.log('🔍 [RAG Factory] Creating Vectorize provider instance');
            provider = new VectorizeRAGProvider(openai);
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