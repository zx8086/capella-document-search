// src/routes/api/credential-check/+server.ts

import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { backendConfig } from "$backendConfig";
import { err, log } from "$utils/unifiedLogger";
import {
  getCredentialDiagnostics,
  redactCredential,
  validateCredentialsWithSTS,
} from "../../../ai/clients/credential-diagnostics";

export async function GET({ request }: RequestEvent) {
  try {
    // Protect with diagnostic token
    const diagnosticToken = Bun.env.DIAGNOSTIC_TOKEN;
    const providedToken = request.headers.get("X-Diagnostic-Token");

    if (diagnosticToken && providedToken !== diagnosticToken) {
      return json(
        { error: "Forbidden: invalid or missing X-Diagnostic-Token header" },
        { status: 403 }
      );
    }

    log("[CredentialCheck] Running credential diagnostics");

    const diagnostics = getCredentialDiagnostics();
    const recommendations: string[] = [];

    // Check consistency
    if (!diagnostics.consistency.allMatch) {
      recommendations.push(
        "Credential sources are inconsistent -- backendConfig, Bun.env, and process.env resolve to different values. " +
          "This can cause different auth behavior in health checks vs LLM calls."
      );
    }

    if (!diagnostics.consistency.accessKeyIdMatch) {
      recommendations.push("AWS_ACCESS_KEY_ID differs between sources");
    }
    if (!diagnostics.consistency.secretAccessKeyMatch) {
      recommendations.push("AWS_SECRET_ACCESS_KEY differs between sources");
    }
    if (!diagnostics.consistency.regionMatch) {
      recommendations.push("AWS_REGION differs between sources");
    }

    // Check if credentials are present
    const accessKeyId = backendConfig.rag.AWS_ACCESS_KEY_ID;
    const secretAccessKey = backendConfig.rag.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      recommendations.push(
        "IAM credentials are missing. Both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required."
      );

      return json({
        timestamp: diagnostics.timestamp,
        credentialSources: diagnostics.sources,
        consistency: diagnostics.consistency,
        stsValidation: null,
        recommendations,
      });
    }

    // Validate with STS
    const stsResult = await validateCredentialsWithSTS(
      { accessKeyId, secretAccessKey },
      backendConfig.rag.AWS_REGION
    );

    if (!stsResult.valid) {
      recommendations.push(`STS validation failed: ${stsResult.error}`);

      if (stsResult.error?.includes("InvalidClientTokenId")) {
        recommendations.push(
          "The AWS_ACCESS_KEY_ID is not recognized. Verify the key exists in IAM and is active."
        );
      }
      if (stsResult.error?.includes("SignatureDoesNotMatch")) {
        recommendations.push(
          "The AWS_SECRET_ACCESS_KEY does not match the access key. Verify the secret was copied correctly."
        );
      }
      if (stsResult.error?.includes("ExpiredToken")) {
        recommendations.push("The credentials have expired. Generate new credentials.");
      }
    }

    log("[CredentialCheck] Diagnostics complete", {
      consistent: diagnostics.consistency.allMatch,
      stsValid: stsResult.valid,
      stsAccount: stsResult.account,
      recommendationCount: recommendations.length,
    });

    return json({
      timestamp: diagnostics.timestamp,
      credentialSources: diagnostics.sources,
      consistency: diagnostics.consistency,
      stsValidation: {
        valid: stsResult.valid,
        account: stsResult.account,
        arn: stsResult.arn,
        userId: stsResult.userId,
        error: stsResult.error,
        responseTimeMs: stsResult.responseTimeMs,
      },
      recommendations,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    err("[CredentialCheck] Failed", { error: errorMessage });

    return json({ error: "Credential check failed", details: errorMessage }, { status: 500 });
  }
}
