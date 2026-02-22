// src/otel/cardinality-guard.ts
// Cardinality guard for metric label protection (SIO-364)

import { backendConfig } from "../backend-config";
import type {
  CardinalityGuardConfig,
  CardinalityStatus,
  CardinalityWarningLevel,
  TelemetryCardinalityGuard,
} from "./types";

class CardinalityGuardImpl implements TelemetryCardinalityGuard {
  private uniqueLabels: Set<string> = new Set();
  private hashBucketsUsed: Set<number> = new Set();
  private lastResetTime: number = Date.now();
  private resetInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: CardinalityGuardConfig) {
    this.startResetInterval();
  }

  private startResetInterval(): void {
    this.resetInterval = setInterval(() => {
      this.reset();
    }, this.config.resetIntervalMs);
  }

  private hashToIndex(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % this.config.hashBuckets;
  }

  checkLabel(labelKey: string, labelValue: string): string {
    const labelId = `${labelKey}:${labelValue}`;

    if (this.uniqueLabels.has(labelId)) {
      return labelValue;
    }

    if (this.uniqueLabels.size < this.config.maxUniqueLabels) {
      this.uniqueLabels.add(labelId);
      return labelValue;
    }

    const bucketIndex = this.hashToIndex(labelValue);
    this.hashBucketsUsed.add(bucketIndex);

    const hashedValue = `bucket_${bucketIndex}`;

    if (this.uniqueLabels.size === this.config.maxUniqueLabels) {
      console.warn(
        `[OTel] Cardinality limit reached (${this.config.maxUniqueLabels}), hashing new labels`
      );
    }

    return hashedValue;
  }

  getStatus(): CardinalityStatus {
    const usagePercent = (this.uniqueLabels.size / this.config.maxUniqueLabels) * 100;

    let warningLevel: CardinalityWarningLevel = "ok";
    if (usagePercent >= this.config.criticalThresholdPercent) {
      warningLevel = "critical";
    } else if (usagePercent >= this.config.warningThresholdPercent) {
      warningLevel = "warning";
    }

    return {
      uniqueLabels: this.uniqueLabels.size,
      maxLabels: this.config.maxUniqueLabels,
      usagePercent,
      warningLevel,
      hashBucketsUsed: this.hashBucketsUsed.size,
      lastResetTime: this.lastResetTime,
    };
  }

  reset(): void {
    const previousSize = this.uniqueLabels.size;
    this.uniqueLabels.clear();
    this.hashBucketsUsed.clear();
    this.lastResetTime = Date.now();

    if (previousSize > 0) {
      console.log(`[OTel] Cardinality guard reset: cleared ${previousSize} labels`);
    }
  }

  destroy(): void {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }
  }
}

let cardinalityGuard: CardinalityGuardImpl | null = null;

export function initializeCardinalityGuard(): TelemetryCardinalityGuard {
  if (!cardinalityGuard) {
    const config: CardinalityGuardConfig = {
      maxUniqueLabels: backendConfig.openTelemetry.MAX_UNIQUE_LABELS,
      hashBuckets: backendConfig.openTelemetry.HASH_BUCKETS,
      resetIntervalMs: backendConfig.openTelemetry.CARDINALITY_RESET_INTERVAL,
      warningThresholdPercent: 70,
      criticalThresholdPercent: 90,
    };

    cardinalityGuard = new CardinalityGuardImpl(config);

    console.log("[OTel] Cardinality guard initialized:", {
      maxUniqueLabels: config.maxUniqueLabels,
      hashBuckets: config.hashBuckets,
      resetIntervalMs: config.resetIntervalMs,
    });
  }
  return cardinalityGuard;
}

export function getCardinalityGuard(): TelemetryCardinalityGuard {
  if (!cardinalityGuard) {
    return initializeCardinalityGuard();
  }
  return cardinalityGuard;
}

export function getCardinalityStatus(): CardinalityStatus {
  return getCardinalityGuard().getStatus();
}

export function checkLabelCardinality(labelKey: string, labelValue: string): string {
  return getCardinalityGuard().checkLabel(labelKey, labelValue);
}

export function destroyCardinalityGuard(): void {
  if (cardinalityGuard) {
    cardinalityGuard.destroy();
    cardinalityGuard = null;
  }
}
