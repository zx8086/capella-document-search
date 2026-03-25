// src/ai/clients/bedrock-bearer-client.ts

import { BedrockEmbeddings, ChatBedrockConverse } from "@langchain/aws";
import { backendConfig } from "$backendConfig";
import { log } from "$utils/unifiedLogger";
import { logStartupDiagnostics, redactCredential } from "./credential-diagnostics";

export interface BedrockCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

// Get IAM credentials from backendConfig (single source of truth)
export function getIAMCredentials(): BedrockCredentials | undefined {
  const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
  const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return { accessKeyId, secretAccessKey };
}

function getBedrockCredentials(): BedrockCredentials {
  const credentials = getIAMCredentials();

  if (!credentials) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock authentication"
    );
  }

  log("[Bedrock] Using IAM credentials", {
    accessKeyFingerprint: redactCredential(credentials.accessKeyId),
    region: backendConfig.rag.AWS_REGION,
  });

  return credentials;
}

export function createBedrockChatModel(options?: { temperature?: number; maxTokens?: number }) {
  // Fire-and-forget startup diagnostics on first use
  logStartupDiagnostics().catch(() => {});

  const credentials = getBedrockCredentials();

  return new ChatBedrockConverse({
    model: backendConfig.rag.BEDROCK_CHAT_MODEL,
    region: backendConfig.rag.AWS_REGION,
    credentials,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens ?? backendConfig.rag.BEDROCK_MAX_TOKENS,
  });
}

export function createBedrockEmbeddings() {
  // Fire-and-forget startup diagnostics on first use
  logStartupDiagnostics().catch(() => {});

  const credentials = getBedrockCredentials();

  return new BedrockEmbeddings({
    model: backendConfig.rag.BEDROCK_EMBEDDING_MODEL,
    region: backendConfig.rag.AWS_REGION,
    credentials,
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
