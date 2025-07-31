# Bedrock Chat Prompt Caching Implementation Guide

## Overview

This guide documents the implementation of prompt caching for the BedrockChatService, which provides significant cost savings (up to 90%) and performance improvements (up to 85% faster) for repeated interactions.

## What Was Implemented

### 1. Added SystemContentBlock Support
- Updated imports to include `SystemContentBlock` type from AWS SDK
- This enables structured system prompts with cache control

### 2. Caching Configuration
```typescript
// Cache configuration with ephemeral type (5-minute TTL)
private readonly CACHE_CONFIG = {
  type: "ephemeral" as const,
};

// Minimum token requirements per model
private readonly MIN_CACHE_TOKENS: Record<string, number> = {
  "anthropic.claude-3-5-sonnet-20241022-v2:0": 1024,
  "anthropic.claude-3-5-sonnet-20240620-v1:0": 1024,
  "eu.anthropic.claude-3-7-sonnet-20250219-v1:0": 1024,
  "anthropic.claude-3-5-haiku-20241022-v1:0": 2048,
  "eu.amazon.nova-pro-v1:0": 1024,
};
```

### 3. System Prompt Restructuring
The system prompt is now split into:
- **Base instructions** (small, dynamic - not cached)
- **Tool execution guidance** (large, static - cached when meets token requirements)

```typescript
private createCachedSystemPrompt(systemPrompt: string, enableCaching: boolean = true): SystemContentBlock[]
```

### 4. Enhanced Token Usage Tracking
- Tracks `cacheReadInputTokens` and `cacheCreationInputTokens`
- Calculates cache hit ratio and cost savings
- Logs detailed cache performance metrics

### 5. New API Options
```typescript
createChatCompletion(messages, {
  enableCaching: true, // Default: true
  // ... other options
});
```

## Usage Examples

### Basic Usage (Caching Enabled by Default)
```typescript
const bedrockService = new BedrockChatService();

// Caching is enabled by default
const stream = bedrockService.createChatCompletion(messages, {
  temperature: 0.3,
  max_tokens: 2000,
});
```

### Disable Caching for Specific Requests
```typescript
const stream = bedrockService.createChatCompletion(messages, {
  temperature: 0.3,
  max_tokens: 2000,
  enableCaching: false, // Explicitly disable caching
});
```

### Check Cache Support
```typescript
const bedrockService = new BedrockChatService();

// Check if model supports caching
console.log('Supports caching:', bedrockService.supportsPromptCaching());

// Get cache configuration
console.log('Cache config:', bedrockService.getCacheConfig());
// Output: { 
//   supported: true, 
//   minTokens: 1024, 
//   cacheType: 'ephemeral', 
//   model: 'anthropic.claude-3-5-sonnet-20241022-v2:0' 
// }
```

## Performance Monitoring

The implementation logs detailed cache metrics:

```
🔄 [BedrockChat] System prompt configuration {
  systemBlockCount: 2,
  hasCachedBlocks: true,
  totalSystemLength: 3500,
  cachingEnabled: true,
  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

📊 [BedrockChat] Token usage extracted from metadata event {
  inputTokens: 3500,
  outputTokens: 250,
  totalTokens: 3750,
  estimatedCost: 0.01425,
  cacheReadTokens: 3000,
  cacheCreationTokens: 0,
  cacheSavings: 0.0081,
  cacheHitRatio: 0.857
}
```

## Cost Savings Example

For a typical conversation with the Couchbase diagnostic tools:

**Without Caching:**
- System prompt + tools: ~3500 tokens
- Cost per request: $0.0105 (at $3.00 per 1M input tokens)
- 100 requests: $1.05

**With Caching:**
- First request: $0.0131 (25% extra for cache creation)
- Subsequent requests: $0.00105 (90% savings)
- 100 requests: ~$0.117 (89% total savings)

## Important Notes

1. **Cache Duration**: Cache expires after 5 minutes of inactivity
2. **Model Support**: Only specific models support caching (check with `supportsPromptCaching()`)
3. **Token Requirements**: Content must meet minimum token requirements (1024 for most models)
4. **Cache Invalidation**: Changes to system prompt or tools will invalidate the cache
5. **Content Position**: Only content at the end of the prompt can be cached

## Troubleshooting

### Cache Not Working?
1. Check if model supports caching: `bedrockService.supportsPromptCaching()`
2. Verify content meets minimum token requirement
3. Ensure caching is not disabled in options
4. Check logs for cache metrics

### Performance Not Improving?
- First request creates cache (slightly more expensive)
- Subsequent requests within 5 minutes will benefit
- Monitor `cacheHitRatio` in logs

## Future Enhancements

1. **Cache Warming**: Pre-cache system prompts on service initialization
2. **Multi-tier Caching**: Different cache strategies for different content types
3. **Cache Analytics**: Dashboard to monitor cache effectiveness
4. **Dynamic Token Estimation**: More accurate token counting for better cache decisions