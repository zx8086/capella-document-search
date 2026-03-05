// src/ai/clients/bedrock-bearer-client.ts

import { BedrockEmbeddings, ChatBedrockConverse } from "@langchain/aws";
import { backendConfig } from "$backendConfig";

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// Check if using Bedrock API key authentication (bearer token)
// API keys start with "ABSK" prefix
function usesBearerTokenAuth(): boolean {
  const token = backendConfig.rag.AWS_BEARER_TOKEN_BEDROCK;
  return !!token && token.startsWith("ABSK");
}

// Get the current auth method for logging
export function getAuthMethod(): "BEDROCK_API_KEY" | "IAM_CREDENTIALS" {
  return usesBearerTokenAuth() ? "BEDROCK_API_KEY" : "IAM_CREDENTIALS";
}

// Get IAM credentials (for services that don't support Bedrock API keys)
export function getIAMCredentials(): BedrockCredentials | undefined {
  const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
  const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return { accessKeyId, secretAccessKey };
}

// Get credentials for Bedrock models (supports API key auth)
function getBedrockCredentials(): BedrockCredentials | undefined {
  if (usesBearerTokenAuth()) {
    // When using Bedrock API key, don't pass credentials
    // The SDK auto-detects AWS_BEARER_TOKEN_BEDROCK from environment
    console.log("[Bedrock] Using Bedrock API Key authentication (bearer token)");
    return undefined;
  }

  console.log("[Bedrock] Using IAM credentials authentication");
  return getIAMCredentials();
}

export function createBedrockChatModel(options?: { temperature?: number; maxTokens?: number }) {
  const credentials = getBedrockCredentials();

  return new ChatBedrockConverse({
    model: backendConfig.rag.BEDROCK_CHAT_MODEL,
    region: backendConfig.rag.AWS_REGION,
    ...(credentials && { credentials }),
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? backendConfig.rag.BEDROCK_MAX_TOKENS,
  });
}

export function createBedrockEmbeddings() {
  const credentials = getBedrockCredentials();

  return new BedrockEmbeddings({
    model: backendConfig.rag.BEDROCK_EMBEDDING_MODEL,
    region: backendConfig.rag.AWS_REGION,
    ...(credentials && { credentials }),
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
