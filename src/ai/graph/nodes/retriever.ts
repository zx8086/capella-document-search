// src/ai/graph/nodes/retriever.ts

import { AmazonKnowledgeBaseRetriever } from "@langchain/aws";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { backendConfig } from "$backendConfig";
import type { RAGContext } from "$lib/rag/types";
import { err, log } from "$utils/unifiedLogger";
import { createBedrockEmbeddings, getIAMCredentials } from "../../clients/bedrock-bearer-client";
import type { AgentStateType } from "../state";

type RAGPipeline = "PINECONE" | "AWS_KNOWLEDGE_BASE" | "CAPELLA" | "VECTORIZE";

let pineconeStore: PineconeStore | null = null;
let awsKBRetriever: AmazonKnowledgeBaseRetriever | null = null;

function getRAGPipeline(): RAGPipeline {
  return backendConfig.rag.RAG_PIPELINE;
}

async function initializePineconeStore(): Promise<PineconeStore> {
  if (pineconeStore) {
    return pineconeStore;
  }

  log("[Retriever] Initializing Pinecone store with LangChain");

  const pinecone = new Pinecone({
    apiKey: backendConfig.rag.PINECONE_API_KEY,
  });

  const pineconeIndex = pinecone.index(backendConfig.rag.PINECONE_INDEX_NAME);

  const embeddings = createBedrockEmbeddings();

  pineconeStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: backendConfig.rag.PINECONE_NAMESPACE,
  });

  log("[Retriever] Pinecone store initialized");
  return pineconeStore;
}

function initializeAWSKnowledgeBaseRetriever(topK: number = 3): AmazonKnowledgeBaseRetriever {
  if (awsKBRetriever) {
    return awsKBRetriever;
  }

  log("[Retriever] Initializing AWS Knowledge Base retriever");

  const iamCredentials = getIAMCredentials();

  log("[Retriever] AWS Knowledge Base auth check", {
    hasIAMCredentials: !!iamCredentials,
  });

  if (!iamCredentials) {
    throw new Error(
      "AWS Knowledge Base requires IAM credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY). " +
        "Bedrock API keys only work for Bedrock models, not Knowledge Base."
    );
  }

  awsKBRetriever = new AmazonKnowledgeBaseRetriever({
    knowledgeBaseId: backendConfig.rag.KNOWLEDGE_BASE_ID,
    region: backendConfig.rag.AWS_REGION,
    topK,
    clientOptions: {
      credentials: iamCredentials,
    },
  });

  log("[Retriever] AWS Knowledge Base retriever initialized", {
    knowledgeBaseId: backendConfig.rag.KNOWLEDGE_BASE_ID,
    region: backendConfig.rag.AWS_REGION,
    topK,
    authMethod: "IAM_CREDENTIALS",
  });

  return awsKBRetriever;
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
  const pipeline = getRAGPipeline();

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
      pipeline,
    });

    const topK = 3;
    let docs: { pageContent: string; metadata: Record<string, unknown> }[] = [];

    switch (pipeline) {
      case "AWS_KNOWLEDGE_BASE": {
        const retriever = initializeAWSKnowledgeBaseRetriever(topK);
        const retrievedDocs = await retriever.invoke(query);
        docs = retrievedDocs;
        break;
      }
      case "PINECONE":
      default: {
        const store = await initializePineconeStore();
        docs = await store.similaritySearch(query, topK);
        break;
      }
    }

    const executionTime = Date.now() - startTime;

    log("[Retriever] Documents retrieved", {
      documentCount: docs.length,
      executionTimeMs: executionTime,
      pipeline,
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
      pipeline,
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
