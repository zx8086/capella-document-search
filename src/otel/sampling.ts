/* src/otel/sampling.ts */

import type { Attributes, Context, Link, SpanKind } from "@opentelemetry/api";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";

/**
 * 2025-compliant sampling strategy with error prioritization
 * Default: 15% sampling rate (within 2025 standard 10-15% range)
 */
export class SmartSampler implements Sampler {
  private baseSampler: Sampler;
  private samplingRate: number;

  constructor(samplingRate: number = 0.15) {
    this.samplingRate = Math.max(0.1, Math.min(0.15, samplingRate)); // Enforce 2025 range

    // Use parent-based sampler with ratio-based root sampling
    this.baseSampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(this.samplingRate),
      remoteParentSampled: new AlwaysOnSampler(),
      remoteParentNotSampled: new AlwaysOffSampler(),
      localParentSampled: new AlwaysOnSampler(),
      localParentNotSampled: new AlwaysOffSampler(),
    });

    console.log(
      `[OTel] Smart sampling initialized with ${(this.samplingRate * 100).toFixed(1)}% rate`
    );
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    // Always sample critical operations (2025 best practice)
    const _criticalAttributes = [
      "error",
      "exception.type",
      "exception.message",
      "http.status_code",
    ];

    // Check for error conditions
    const isError =
      attributes["error"] === true ||
      attributes["exception.type"] !== undefined ||
      (typeof attributes["http.status_code"] === "number" && attributes["http.status_code"] >= 400);

    if (isError) {
      console.debug("[OTel] Sampling error span:", spanName);
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          ...attributes,
          "sampling.priority": "high",
          "sampling.reason": "error",
        },
      };
    }

    // Always sample authentication operations
    const authOperations = ["authentication", "authorization", "login", "token.validation"];

    if (authOperations.some((op) => spanName.toLowerCase().includes(op))) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          ...attributes,
          "sampling.priority": "high",
          "sampling.reason": "auth",
        },
      };
    }

    // Always sample Couchbase operations (business critical)
    if (spanName.includes("couchbase") || spanName.includes("capella")) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          ...attributes,
          "sampling.priority": "medium",
          "sampling.reason": "database",
        },
      };
    }

    // Use base sampling for everything else
    const result = this.baseSampler.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links
    );

    // Add sampling metadata
    if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
      return {
        ...result,
        attributes: {
          ...result.attributes,
          "sampling.rate": this.samplingRate,
          "sampling.reason": "ratio",
        },
      };
    }

    return result;
  }

  toString(): string {
    return `SmartSampler{rate=${this.samplingRate}}`;
  }
}

/**
 * Create sampling strategy based on environment
 */
export function createSampler(config?: { samplingRate?: number; environment?: string }): Sampler {
  const samplingRate =
    config?.samplingRate ||
    parseFloat(
      (typeof Bun !== "undefined" ? Bun.env.OTEL_SAMPLING_RATE : process.env.OTEL_SAMPLING_RATE) ||
        "0.15"
    );

  const environment =
    config?.environment ||
    (typeof Bun !== "undefined" ? Bun.env.NODE_ENV : process.env.NODE_ENV) ||
    "development";

  // Development: higher sampling for debugging
  if (environment === "development") {
    return new SmartSampler(Math.min(samplingRate * 2, 0.5)); // Max 50% in dev
  }

  // Production: 2025 standard sampling
  if (environment === "production") {
    return new SmartSampler(samplingRate);
  }

  // Staging: balanced sampling
  return new SmartSampler(samplingRate * 1.5);
}
