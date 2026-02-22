// src/otel/types.ts
// Telemetry types and interfaces (SIO-360)

export enum TelemetryCircuitBreakerState {
  CLOSED = 0,
  OPEN = 1,
  HALF_OPEN = 2,
}

export type TelemetrySignalType = "traces" | "metrics" | "logs";

export interface TelemetryCircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
  monitoringIntervalMs: number;
}

export interface CircuitBreakerStatus {
  state: TelemetryCircuitBreakerState;
  stateName: string;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  lastStateChangeTime: number;
}

export interface ExportAttempt {
  timestamp: number;
  success: boolean;
  error?: string;
  durationMs: number;
  itemCount: number;
}

export interface SignalExportStats {
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
  totalItemsExported: number;
  successRate: number;
  avgDurationMs: number;
  lastExportTime: number | null;
  lastFailureTime: number | null;
  recentErrors: Array<{ timestamp: number; error: string }>;
}

export interface ExportStats {
  traces: SignalExportStats;
  metrics: SignalExportStats;
  logs: SignalExportStats;
}

export type CardinalityWarningLevel = "ok" | "warning" | "critical";

export interface CardinalityGuardConfig {
  maxUniqueLabels: number;
  hashBuckets: number;
  resetIntervalMs: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
}

export interface CardinalityStatus {
  uniqueLabels: number;
  maxLabels: number;
  usagePercent: number;
  warningLevel: CardinalityWarningLevel;
  hashBucketsUsed: number;
  lastResetTime: number;
}

export interface TelemetryHealthStatus {
  enabled: boolean;
  circuitBreakers: {
    traces: CircuitBreakerStatus;
    metrics: CircuitBreakerStatus;
    logs: CircuitBreakerStatus;
  };
  exportStats: ExportStats;
  cardinality: CardinalityStatus;
}

export interface TelemetryCircuitBreaker {
  getState(): TelemetryCircuitBreakerState;
  getStatus(): CircuitBreakerStatus;
  canExecute(): boolean;
  recordSuccess(durationMs: number): void;
  recordFailure(error: Error): void;
  reset(): void;
}

export interface TelemetryExportStatsTracker {
  recordExport(signal: TelemetrySignalType, attempt: ExportAttempt): void;
  getStats(): ExportStats;
  getSignalStats(signal: TelemetrySignalType): SignalExportStats;
  reset(): void;
}

export interface TelemetryCardinalityGuard {
  checkLabel(labelKey: string, labelValue: string): string;
  getStatus(): CardinalityStatus;
  reset(): void;
}

export interface TelemetryLifecycle {
  shutdown(): Promise<void>;
  isShuttingDown(): boolean;
}
