// src/ai/clients/credential-diagnostics.ts

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { backendConfig } from "$backendConfig";
import { log } from "$utils/unifiedLogger";

export interface RedactedCredentialSource {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface CredentialConsistency {
  accessKeyIdMatch: boolean;
  secretAccessKeyMatch: boolean;
  regionMatch: boolean;
  allMatch: boolean;
}

export interface CredentialDiagnostics {
  timestamp: string;
  authMethod: "IAM_CREDENTIALS";
  sources: {
    backendConfig: RedactedCredentialSource;
    bunEnv: RedactedCredentialSource;
    processEnv: RedactedCredentialSource;
  };
  consistency: CredentialConsistency;
}

export interface STSValidationResult {
  valid: boolean;
  account?: string;
  arn?: string;
  userId?: string;
  error?: string;
  responseTimeMs: number;
}

export function redactCredential(value: string | undefined): string {
  if (value === undefined) return "<not set>";
  if (value === "") return "<empty>";
  if (value.length < 8) return "****";
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
}

export function getCredentialDiagnostics(): CredentialDiagnostics {
  const backendSource: RedactedCredentialSource = {
    accessKeyId: redactCredential(backendConfig.rag.AWS_ACCESS_KEY_ID),
    secretAccessKey: redactCredential(backendConfig.rag.AWS_SECRET_ACCESS_KEY),
    region: backendConfig.rag.AWS_REGION,
  };

  const bunSource: RedactedCredentialSource = {
    accessKeyId: redactCredential(Bun.env.AWS_ACCESS_KEY_ID),
    secretAccessKey: redactCredential(Bun.env.AWS_SECRET_ACCESS_KEY),
    region: Bun.env.AWS_REGION || "<not set>",
  };

  const processSource: RedactedCredentialSource = {
    accessKeyId: redactCredential(process.env.AWS_ACCESS_KEY_ID),
    secretAccessKey: redactCredential(process.env.AWS_SECRET_ACCESS_KEY),
    region: process.env.AWS_REGION || "<not set>",
  };

  // Compare raw values (not redacted) for consistency
  const accessKeyIdMatch =
    (backendConfig.rag.AWS_ACCESS_KEY_ID || "") === (Bun.env.AWS_ACCESS_KEY_ID || "") &&
    (Bun.env.AWS_ACCESS_KEY_ID || "") === (process.env.AWS_ACCESS_KEY_ID || "");

  const secretAccessKeyMatch =
    (backendConfig.rag.AWS_SECRET_ACCESS_KEY || "") === (Bun.env.AWS_SECRET_ACCESS_KEY || "") &&
    (Bun.env.AWS_SECRET_ACCESS_KEY || "") === (process.env.AWS_SECRET_ACCESS_KEY || "");

  const regionMatch =
    (backendConfig.rag.AWS_REGION || "") === (Bun.env.AWS_REGION || "") &&
    (Bun.env.AWS_REGION || "") === (process.env.AWS_REGION || "");

  return {
    timestamp: new Date().toISOString(),
    authMethod: "IAM_CREDENTIALS",
    sources: {
      backendConfig: backendSource,
      bunEnv: bunSource,
      processEnv: processSource,
    },
    consistency: {
      accessKeyIdMatch,
      secretAccessKeyMatch,
      regionMatch,
      allMatch: accessKeyIdMatch && secretAccessKeyMatch && regionMatch,
    },
  };
}

export async function validateCredentialsWithSTS(
  credentials: { accessKeyId: string; secretAccessKey: string },
  region: string
): Promise<STSValidationResult> {
  const startTime = Date.now();

  try {
    const stsClient = new STSClient({
      region,
      credentials,
      maxAttempts: 1,
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false },
        connectionTimeout: 5000,
        requestTimeout: 10000,
      }),
    });

    const response = await stsClient.send(new GetCallerIdentityCommand({}));
    const responseTimeMs = Date.now() - startTime;

    return {
      valid: true,
      account: response.Account,
      arn: response.Arn,
      userId: response.UserId,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      valid: false,
      error: errorMessage,
      responseTimeMs,
    };
  }
}

let startupDiagnosticsLogged = false;

export async function logStartupDiagnostics(): Promise<void> {
  if (startupDiagnosticsLogged) return;
  startupDiagnosticsLogged = true;

  const diagnostics = getCredentialDiagnostics();

  log("[Bedrock] Credential diagnostics", {
    authMethod: diagnostics.authMethod,
    sources: diagnostics.sources,
    consistency: diagnostics.consistency,
  });

  if (!diagnostics.consistency.allMatch) {
    log("[Bedrock] WARNING: Credential sources are inconsistent", {
      accessKeyIdMatch: diagnostics.consistency.accessKeyIdMatch,
      secretAccessKeyMatch: diagnostics.consistency.secretAccessKeyMatch,
      regionMatch: diagnostics.consistency.regionMatch,
    });
  }

  // Validate credentials with STS
  const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
  const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    const stsResult = await validateCredentialsWithSTS(
      { accessKeyId, secretAccessKey },
      backendConfig.rag.AWS_REGION
    );

    log("[Bedrock] STS credential validation", {
      valid: stsResult.valid,
      account: stsResult.account,
      arn: stsResult.arn,
      responseTimeMs: stsResult.responseTimeMs,
      ...(stsResult.error && { error: stsResult.error }),
    });
  } else {
    log("[Bedrock] WARNING: IAM credentials not configured, skipping STS validation");
  }
}
