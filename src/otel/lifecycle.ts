// src/otel/lifecycle.ts
// Graceful shutdown handlers (SIO-375)

import type { NodeSDK } from "@opentelemetry/sdk-node";
import { destroyCardinalityGuard } from "./cardinality-guard";
import { destroyTelemetryCircuitBreakers } from "./telemetry-circuit-breaker";
import type { TelemetryLifecycle } from "./types";

const SHUTDOWN_TIMEOUT_MS = 10000;

export function createTelemetryLifecycle(sdk: NodeSDK): TelemetryLifecycle {
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      console.log("[OTel] Shutdown already in progress");
      return;
    }
    shuttingDown = true;

    console.log("[OTel] Starting graceful shutdown...");

    try {
      await Promise.race([
        (async () => {
          // Destroy circuit breakers and cardinality guard
          destroyTelemetryCircuitBreakers();
          destroyCardinalityGuard();

          // Shutdown SDK
          await sdk.shutdown();
          console.log("[OTel] SDK shutdown complete");
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Shutdown timeout")), SHUTDOWN_TIMEOUT_MS)
        ),
      ]);

      console.log("[OTel] Graceful shutdown complete");
    } catch (error) {
      console.error("[OTel] Shutdown error:", error);
    }
  };

  // Register signal handlers
  const handleSignal = (signal: string) => {
    console.log(`[OTel] Received ${signal}, initiating shutdown...`);
    shutdown().then(() => {
      if (typeof Bun !== "undefined") {
        Bun.sleep(500).then(() => process.exit(0));
      } else {
        setTimeout(() => process.exit(0), 500);
      }
    });
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));

  return {
    shutdown,
    isShuttingDown: () => shuttingDown,
  };
}

let lifecycle: TelemetryLifecycle | null = null;

export function initializeTelemetryLifecycle(sdk: NodeSDK): TelemetryLifecycle {
  if (!lifecycle) {
    lifecycle = createTelemetryLifecycle(sdk);
    console.log("[OTel] Lifecycle handlers registered");
  }
  return lifecycle;
}

export function getTelemetryLifecycle(): TelemetryLifecycle | null {
  return lifecycle;
}
