/* src/lib/rag/types.ts */

import type { RunTracer } from "langsmith/traceable";

export interface RAGContext {
    text: string;
    filename: string;
}

export interface RAGResponse {
    stream: any;
    context: RAGContext[];
}

export interface RAGMetadata {
    // User Information
    userId: string;
    userName: string;
    userEmail: string;
    tenantId?: string;
    isAuthenticated: boolean;

    // Environment & Context
    environment: string;
    pathname: string;
    
    // Session Information
    sessionStartTime?: string;
    messageCount: number;
    
    // Request Details
    clientTimestamp?: string;
    serverTimestamp: string;
    
    // Performance Metrics
    processingStartTime: number;
    
    // Message Details
    messageLength: number;
        
    // Allow additional properties
    [key: string]: any;
}

export interface RAGProvider {
    query: (message: string, metadata: RAGMetadata) => Promise<RAGResponse>;
    initialize: () => Promise<void>;
} 