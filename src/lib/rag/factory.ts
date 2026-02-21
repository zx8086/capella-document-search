// src/lib/rag/factory.ts
// DEPRECATED: This factory is no longer used. The LangGraph agent in src/ai/graph/ handles RAG directly.
// Keeping this file for backward compatibility but it will throw an error if used.

import { err } from "../../utils/unifiedLogger";
import type { RAGProvider } from "./types";

export function createRAGProvider(_fetch: typeof fetch): RAGProvider {
  err(
    "[RAG Factory] DEPRECATED: This factory is no longer used. The application now uses the LangGraph agent in src/ai/graph/ which handles RAG directly via @langchain/pinecone."
  );

  throw new Error(
    "RAG Factory is deprecated. The application now uses the LangGraph agent " +
      "which handles RAG directly via @langchain/pinecone. " +
      "See src/ai/graph/nodes/retriever.ts for the new implementation."
  );
}
