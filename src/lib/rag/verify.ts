// src/lib/rag/verify.ts
// DEPRECATED: The RAG verification was for the old RAG factory which is no longer used.
// The LangGraph agent in src/ai/graph/ handles RAG directly via @langchain/pinecone.

export async function verifyRAGSetup() {
  console.log("[RAG Verify] Environment check (deprecated - LangGraph agent handles RAG directly)");

  console.log("[RAG Verify] Environment variables:", {
    RAG_PIPELINE: Bun.env.RAG_PIPELINE,
    PINECONE_API_KEY: Bun.env.PINECONE_API_KEY ? "Set" : "Missing",
    PINECONE_INDEX_NAME: Bun.env.PINECONE_INDEX_NAME,
    PINECONE_NAMESPACE: Bun.env.PINECONE_NAMESPACE,
    NODE_ENV: Bun.env.NODE_ENV,
  });

  console.log(
    "[RAG Verify] Note: The application now uses the LangGraph agent which handles RAG directly."
  );
  console.log("[RAG Verify] See src/ai/graph/nodes/retriever.ts for the current implementation.");
}
