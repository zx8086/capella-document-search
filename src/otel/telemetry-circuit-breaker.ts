// src/otel/telemetry-circuit-breaker.ts
// Per-signal telemetry circuit breakers (SIO-362)

import { backendConfig } from "../backend-config";
import type {
  CircuitBreakerStatus,
  TelemetryCircuitBreaker,
  TelemetryCircuitBreakerConfig,
  TelemetrySignalType,
} from "./types";
import { TelemetryCircuitBreakerState } from "./types";

class SignalCircuitBreaker implements TelemetryCircuitBreaker {
  private state: TelemetryCircuitBreakerState = TelemetryCircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastStateChangeTime: number = Date.now();
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly signal: TelemetrySignalType,
    private readonly config: TelemetryCircuitBreakerConfig,
    private readonly onStateChange?: (
      signal: TelemetrySignalType,
      oldState: TelemetryCircuitBreakerState,
      newState: TelemetryCircuitBreakerState
    ) => void
  ) {
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkRecovery();
    }, this.config.monitoringIntervalMs);
  }

  private checkRecovery(): void {
    if (this.state !== TelemetryCircuitBreakerState.OPEN) return;

    const now = Date.now();
    if (this.lastFailureTime && now - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
      this.transitionTo(TelemetryCircuitBreakerState.HALF_OPEN);
    }
  }

  private transitionTo(newState: TelemetryCircuitBreakerState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    const stateNames = ["CLOSED", "OPEN", "HALF_OPEN"];
    console.log(
      `[OTel] Circuit breaker [${this.signal}]: ${stateNames[oldState]} -> ${stateNames[newState]}`
    );

    if (newState === TelemetryCircuitBreakerState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === TelemetryCircuitBreakerState.HALF_OPEN) {
      this.successes = 0;
    }

    this.onStateChange?.(this.signal, oldState, newState);
  }

  getState(): TelemetryCircuitBreakerState {
    return this.state;
  }

  getStatus(): CircuitBreakerStatus {
    const stateNames = ["CLOSED", "OPEN", "HALF_OPEN"];
    return {
      state: this.state,
      stateName: stateNames[this.state],
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChangeTime: this.lastStateChangeTime,
    };
  }

  canExecute(): boolean {
    switch (this.state) {
      case TelemetryCircuitBreakerState.CLOSED:
        return true;
      case TelemetryCircuitBreakerState.OPEN:
        return false;
      case TelemetryCircuitBreakerState.HALF_OPEN:
        return true;
      default:
        return false;
    }
  }

  recordSuccess(_durationMs: number): void {
    this.lastSuccessTime = Date.now();
    this.successes++;

    if (this.state === TelemetryCircuitBreakerState.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(TelemetryCircuitBreakerState.CLOSED);
      }
    } else if (this.state === TelemetryCircuitBreakerState.CLOSED) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failures++;

    console.warn(`[OTel] Circuit breaker [${this.signal}] recorded failure:`, error.message);

    if (this.state === TelemetryCircuitBreakerState.HALF_OPEN) {
      this.transitionTo(TelemetryCircuitBreakerState.OPEN);
    } else if (this.state === TelemetryCircuitBreakerState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo(TelemetryCircuitBreakerState.OPEN);
      }
    }
  }

  reset(): void {
    this.transitionTo(TelemetryCircuitBreakerState.CLOSED);
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

interface TelemetryCircuitBreakers {
  traces: SignalCircuitBreaker;
  metrics: SignalCircuitBreaker;
  logs: SignalCircuitBreaker;
}

let circuitBreakers: TelemetryCircuitBreakers | null = null;

export function initializeTelemetryCircuitBreakers(
  onStateChange?: (
    signal: TelemetrySignalType,
    oldState: TelemetryCircuitBreakerState,
    newState: TelemetryCircuitBreakerState
  ) => void
): TelemetryCircuitBreakers {
  if (circuitBreakers) {
    return circuitBreakers;
  }

  const config: TelemetryCircuitBreakerConfig = {
    failureThreshold: backendConfig.openTelemetry.CB_FAILURE_THRESHOLD,
    recoveryTimeoutMs: backendConfig.openTelemetry.CB_RECOVERY_TIMEOUT,
    successThreshold: backendConfig.openTelemetry.CB_SUCCESS_THRESHOLD,
    monitoringIntervalMs: backendConfig.openTelemetry.CB_MONITORING_INTERVAL,
  };

  circuitBreakers = {
    traces: new SignalCircuitBreaker("traces", config, onStateChange),
    metrics: new SignalCircuitBreaker("metrics", config, onStateChange),
    logs: new SignalCircuitBreaker("logs", config, onStateChange),
  };

  console.log("[OTel] Circuit breakers initialized:", {
    failureThreshold: config.failureThreshold,
    recoveryTimeoutMs: config.recoveryTimeoutMs,
    successThreshold: config.successThreshold,
  });

  return circuitBreakers;
}

export function getTelemetryCircuitBreakers(): TelemetryCircuitBreakers {
  if (!circuitBreakers) {
    return initializeTelemetryCircuitBreakers();
  }
  return circuitBreakers;
}

export function getCircuitBreakerStatus(): Record<TelemetrySignalType, CircuitBreakerStatus> {
  const breakers = getTelemetryCircuitBreakers();
  return {
    traces: breakers.traces.getStatus(),
    metrics: breakers.metrics.getStatus(),
    logs: breakers.logs.getStatus(),
  };
}

export function destroyTelemetryCircuitBreakers(): void {
  if (circuitBreakers) {
    circuitBreakers.traces.destroy();
    circuitBreakers.metrics.destroy();
    circuitBreakers.logs.destroy();
    circuitBreakers = null;
  }
}
