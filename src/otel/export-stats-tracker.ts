// src/otel/export-stats-tracker.ts
// Export statistics tracker (SIO-363)

import type {
  ExportAttempt,
  ExportStats,
  SignalExportStats,
  TelemetryExportStatsTracker,
  TelemetrySignalType,
} from "./types";

const MAX_RECENT_ERRORS = 10;

function createEmptySignalStats(): SignalExportStats {
  return {
    totalAttempts: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    totalItemsExported: 0,
    successRate: 100,
    avgDurationMs: 0,
    lastExportTime: null,
    lastFailureTime: null,
    recentErrors: [],
  };
}

class ExportStatsTrackerImpl implements TelemetryExportStatsTracker {
  private stats: ExportStats = {
    traces: createEmptySignalStats(),
    metrics: createEmptySignalStats(),
    logs: createEmptySignalStats(),
  };

  private durationSum: Record<TelemetrySignalType, number> = {
    traces: 0,
    metrics: 0,
    logs: 0,
  };

  recordExport(signal: TelemetrySignalType, attempt: ExportAttempt): void {
    const signalStats = this.stats[signal];

    signalStats.totalAttempts++;
    signalStats.totalItemsExported += attempt.itemCount;
    this.durationSum[signal] += attempt.durationMs;
    signalStats.avgDurationMs = this.durationSum[signal] / signalStats.totalAttempts;

    if (attempt.success) {
      signalStats.totalSuccesses++;
      signalStats.lastExportTime = attempt.timestamp;
    } else {
      signalStats.totalFailures++;
      signalStats.lastFailureTime = attempt.timestamp;

      if (attempt.error) {
        signalStats.recentErrors.push({
          timestamp: attempt.timestamp,
          error: attempt.error,
        });
        if (signalStats.recentErrors.length > MAX_RECENT_ERRORS) {
          signalStats.recentErrors.shift();
        }
      }
    }

    signalStats.successRate =
      signalStats.totalAttempts > 0
        ? (signalStats.totalSuccesses / signalStats.totalAttempts) * 100
        : 100;
  }

  getStats(): ExportStats {
    return {
      traces: { ...this.stats.traces, recentErrors: [...this.stats.traces.recentErrors] },
      metrics: { ...this.stats.metrics, recentErrors: [...this.stats.metrics.recentErrors] },
      logs: { ...this.stats.logs, recentErrors: [...this.stats.logs.recentErrors] },
    };
  }

  getSignalStats(signal: TelemetrySignalType): SignalExportStats {
    return { ...this.stats[signal], recentErrors: [...this.stats[signal].recentErrors] };
  }

  reset(): void {
    this.stats = {
      traces: createEmptySignalStats(),
      metrics: createEmptySignalStats(),
      logs: createEmptySignalStats(),
    };
    this.durationSum = { traces: 0, metrics: 0, logs: 0 };
  }
}

let statsTracker: ExportStatsTrackerImpl | null = null;

export function initializeExportStatsTracker(): TelemetryExportStatsTracker {
  if (!statsTracker) {
    statsTracker = new ExportStatsTrackerImpl();
    console.log("[OTel] Export stats tracker initialized");
  }
  return statsTracker;
}

export function getExportStatsTracker(): TelemetryExportStatsTracker {
  if (!statsTracker) {
    return initializeExportStatsTracker();
  }
  return statsTracker;
}

export function getExportStats(): ExportStats {
  return getExportStatsTracker().getStats();
}

export function formatExportStats(): Record<TelemetrySignalType, object> {
  const stats = getExportStats();

  const formatSignal = (s: SignalExportStats) => ({
    totalAttempts: s.totalAttempts,
    totalFailures: s.totalFailures,
    successRate: `${s.successRate.toFixed(2)}%`,
    avgDurationMs: `${s.avgDurationMs.toFixed(2)}ms`,
    lastExportTime: s.lastExportTime ? new Date(s.lastExportTime).toISOString() : null,
    lastFailureTime: s.lastFailureTime ? new Date(s.lastFailureTime).toISOString() : null,
    recentErrorCount: s.recentErrors.length,
  });

  return {
    traces: formatSignal(stats.traces),
    metrics: formatSignal(stats.metrics),
    logs: formatSignal(stats.logs),
  };
}
