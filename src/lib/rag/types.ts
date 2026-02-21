// src/lib/rag/types.ts

export interface RAGContext {
  text: string;
  filename: string;
  pageNumber?: number;
  chunkIndex?: number;
  metadata?: Record<string, any>;
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
  sessionId?: string;
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

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RAGProvider {
  query: (
    message: string,
    metadata: RAGMetadata,
    messages?: ConversationMessage[]
  ) => Promise<RAGResponse>;
  initialize: () => Promise<void>;
}
