import type {
  Provider,
  ProviderStatus,
  ResolutionDetails,
  JsonValue
} from '@openfeature/web-sdk';
import type { EvaluationContext } from '@openfeature/core';
import { GrowthBook } from '@growthbook/growthbook';

export class GrowthBookProvider implements Provider {
  readonly runsOn = 'client';
  readonly metadata = {
    name: 'GrowthBook Provider',
  } as const;

  private gb: GrowthBook;

  constructor(gb: GrowthBook) {
    this.gb = gb;
  }

  async initialize(): Promise<void> {
    await this.gb.loadFeatures();
    return Promise.resolve();
  }

  status(): ProviderStatus {
    return this.gb.ready ? 'READY' : 'NOT_READY';
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean
  ): Promise<ResolutionDetails<boolean>> {
    const value = this.gb.isOn(flagKey);
    return {
      value: value ?? defaultValue,
      reason: value !== undefined ? 'TARGETING_MATCH' : 'DEFAULT'
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context?: EvaluationContext | undefined
  ): Promise<ResolutionDetails<string>> {
    return Promise.resolve({
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    });
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context?: EvaluationContext | undefined
  ): Promise<ResolutionDetails<number>> {
    return Promise.resolve({
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    });
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context?: EvaluationContext | undefined
  ): Promise<ResolutionDetails<T>> {
    return Promise.resolve({
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    });
  }
} 