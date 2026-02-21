// src/ai/clients/bedrock-bearer-client.ts

import { BedrockEmbeddings, ChatBedrockConverse } from "@langchain/aws";
import { backendConfig } from "$backendConfig";

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

function getBedrockCredentials(): BedrockCredentials {
  return {
    accessKeyId: backendConfig.rag.AWS_ACCESS_KEY_ID,
    secretAccessKey: backendConfig.rag.AWS_SECRET_ACCESS_KEY,
    sessionToken: backendConfig.rag.AWS_BEARER_TOKEN_BEDROCK || undefined,
  };
}

export function createBedrockChatModel(options?: { temperature?: number; maxTokens?: number }) {
  return new ChatBedrockConverse({
    model: backendConfig.rag.BEDROCK_CHAT_MODEL,
    region: backendConfig.rag.AWS_REGION,
    credentials: getBedrockCredentials(),
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? backendConfig.rag.BEDROCK_MAX_TOKENS,
  });
}

export function createBedrockEmbeddings() {
  return new BedrockEmbeddings({
    model: backendConfig.rag.BEDROCK_EMBEDDING_MODEL,
    region: backendConfig.rag.AWS_REGION,
    credentials: getBedrockCredentials(),
  });
}

// Configuration helpers
export function getMaxRecursionDepth(): number {
  return backendConfig.rag.BEDROCK_MAX_TOOL_RECURSION_DEPTH;
}

export function getMaxTokens(): number {
  return backendConfig.rag.BEDROCK_MAX_TOKENS;
}

export function getRegion(): string {
  return backendConfig.rag.AWS_REGION;
}

export function getChatModelId(): string {
  return backendConfig.rag.BEDROCK_CHAT_MODEL;
}

export function getEmbeddingModelId(): string {
  return backendConfig.rag.BEDROCK_EMBEDDING_MODEL;
}
