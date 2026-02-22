import type { GrowthBook } from "@growthbook/growthbook";
import { ClientProviderStatus } from "@openfeature/core";
import type {
  EvaluationContext,
  JsonValue,
  Logger,
  Provider,
  ProviderStatus,
  ResolutionDetails,
} from "@openfeature/web-sdk";

export class GrowthBookProvider implements Provider {
  readonly runsOn = "client";
  readonly metadata = {
    name: "GrowthBook Provider",
  } as const;

  private gb: GrowthBook;

  constructor(gb: GrowthBook) {
    this.gb = gb;
  }

  async initialize(): Promise<void> {
    await this.gb.loadFeatures();
    return Promise.resolve();
  }

  get status(): ProviderStatus {
    return this.gb.ready ? ClientProviderStatus.READY : ClientProviderStatus.NOT_READY;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<boolean> {
    const value = this.gb.isOn(flagKey);
    return {
      value: value ?? defaultValue,
      reason: value !== undefined ? "TARGETING_MATCH" : "DEFAULT",
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<string> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: "DEFAULT",
    };
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<number> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: "DEFAULT",
    };
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<T> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: "DEFAULT",
    };
  }
}
