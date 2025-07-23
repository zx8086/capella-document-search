import type {
  Provider,
  ProviderStatus,
  ResolutionDetails,
  JsonValue,
  EvaluationContext,
  Logger
} from '@openfeature/web-sdk';
import { ClientProviderStatus } from '@openfeature/core';
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

  get status(): ProviderStatus {
    return this.gb.ready ? ClientProviderStatus.READY : ClientProviderStatus.NOT_READY;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger
  ): ResolutionDetails<boolean> {
    const value = this.gb.isOn(flagKey);
    return {
      value: value ?? defaultValue,
      reason: value !== undefined ? 'TARGETING_MATCH' : 'DEFAULT'
    };
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger
  ): ResolutionDetails<string> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    };
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger
  ): ResolutionDetails<number> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    };
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger
  ): ResolutionDetails<T> {
    return {
      value: this.gb.getFeatureValue(flagKey, defaultValue) ?? defaultValue,
      reason: 'DEFAULT'
    };
  }
} 