// src/ai/graph/nodes/retriever.ts

import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import type { RAGContext } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockEmbeddings } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

let pineconeStore: PineconeStore | null = null;

async function initializePineconeStore(): Promise<PineconeStore> {
  if (pineconeStore) {
    return pineconeStore;
  }

  log("[Retriever] Initializing Pinecone store with LangChain");

  const pinecone = new Pinecone({
    apiKey: Bun.env.PINECONE_API_KEY as string,
  });

  const pineconeIndex = pinecone.index(Bun.env.PINECONE_INDEX_NAME as string);

  const embeddings = createBedrockEmbeddings();

  pineconeStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: Bun.env.PINECONE_NAMESPACE as string,
  });

  log("[Retriever] Pinecone store initialized");
  return pineconeStore;
}

function extractQueryFromMessages(messages: AgentStateType["messages"]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && "content" in lastMessage) {
    const content = lastMessage.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === "string" ? c : c.text || "")).join(" ");
    }
  }
  return "";
}

function documentsToRAGContext(
  docs: { pageContent: string; metadata: Record<string, any> }[]
): RAGContext[] {
  return docs.map((doc) => ({
    text: doc.pageContent,
    filename: doc.metadata?.filename || doc.metadata?.source || "Unknown",
    pageNumber: doc.metadata?.page || doc.metadata?.pageNumber || doc.metadata?.page_number,
    chunkIndex: doc.metadata?.chunkIndex || doc.metadata?.chunk || doc.metadata?.chunk_index,
    metadata: doc.metadata,
  }));
}

export async function retrieverNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const startTime = Date.now();

  try {
    const query = extractQueryFromMessages(state.messages);

    if (!query) {
      log("[Retriever] No query found in messages, skipping retrieval");
      return {
        ragContext: [],
      };
    }

    log("[Retriever] Processing query", {
      queryLength: query.length,
      queryPreview: query.substring(0, 100),
    });

    const store = await initializePineconeStore();

    const topK = 3;
    const docs = await store.similaritySearch(query, topK);

    const executionTime = Date.now() - startTime;

    log("[Retriever] Documents retrieved", {
      documentCount: docs.length,
      executionTimeMs: executionTime,
    });

    const ragContext = documentsToRAGContext(docs);

    return {
      ragContext,
    };
  } catch (e) {
    const executionTime = Date.now() - startTime;
    const errorMessage = e instanceof Error ? e.message : String(e);
    err("[Retriever] Retrieval failed", {
      error: errorMessage,
      executionTimeMs: executionTime,
    });

    return {
      ragContext: [],
      error: `Retrieval failed: ${errorMessage}`,
    };
  }
}

export async function shouldRetrieve(state: AgentStateType): Promise<"retrieve" | "skip"> {
  if (state.queryClassification === "simple") {
    log("[Retriever] Skipping retrieval for simple query");
    return "skip";
  }

  const query = extractQueryFromMessages(state.messages);
  if (!query || query.length < 5) {
    log("[Retriever] Skipping retrieval for empty/short query");
    return "skip";
  }

  return "retrieve";
}
