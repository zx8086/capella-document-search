# Cache Token Tracking Guide

## Overview
This guide explains how to track and verify cache token usage in the Bedrock Chat service to ensure caching is working properly.

## Current Implementation

### 1. Cache Setup
The system is configured to use prompt caching:
```typescript
private readonly CACHE_CONFIG = {
  type: "ephemeral" as const,
};
```

Cache blocks are added to system prompts and tool guidance when they meet minimum token requirements.

### 2. Cache Metrics Extraction
The system currently extracts cache metrics from the metadata event:
```typescript
const cacheReadTokens = event.metadata.usage.cacheReadInputTokens || 0;
const cacheCreationTokens = event.metadata.usage.cacheCreationInputTokens || 0;
```

### 3. Cache Logging
Cache metrics are logged with every token usage report:
```typescript
log("📊 [BedrockChat] Token usage extracted from metadata event", {
  inputTokens,
  outputTokens,
  totalTokens,
  estimatedCost,
  cacheReadTokens,
  cacheCreationTokens,
  cacheSavings,
  cacheHitRatio,
});
```

## Issue: Cache Not Being Utilized

Based on the logs, cache metrics are consistently showing zeros:
- `cacheCreationTokens: 0`
- `cacheReadTokens: 0`
- `cacheHitRatio: 0`
- `cacheSavings: 0`

## Potential Causes

1. **AWS Bedrock Cache Field Names**: AWS Bedrock might use different field names for cache metrics than expected.

2. **Model Support**: Not all models or regions support prompt caching. Verify that `eu.anthropic.claude-3-7-sonnet-20250219-v1:0` supports caching in the `eu-central-1` region.

3. **Minimum Token Requirement**: The system requires minimum tokens (1024) for caching. Check if system prompts meet this requirement.

4. **Cache Block Structure**: The cache control might need a different structure for AWS Bedrock.

## Troubleshooting Steps

### 1. Verify Full Metadata Structure
Log the complete metadata event to see all available fields:
```typescript
log("🔍 [BedrockChat] Full metadata structure", {
  fullMetadata: JSON.stringify(event.metadata, null, 2),
});
```

### 2. Check AWS Documentation
Verify the correct field names for cache metrics in AWS Bedrock's Converse API response.

### 3. Verify Cache Control Format
Ensure the cache control block format matches AWS Bedrock's requirements:
```typescript
{
  text: systemPrompt,
  cacheControl: { type: "ephemeral" }
}
```

### 4. Monitor First Request vs Subsequent Requests
Cache creation happens on the first request, while cache reads happen on subsequent requests with the same prompt.

## Recommended Improvements

### 1. Enhanced Cache Logging
Add more detailed cache tracking:
```typescript
// Log when cache blocks are created
log("📦 [BedrockChat] Cache block created", {
  blockLength: text.length,
  blockType: "system",
  cacheConfig: this.CACHE_CONFIG,
});

// Log cache status with each request
log("🔍 [BedrockChat] Cache status", {
  hasCachedBlocks: systemPromptBlocks.some(block => 'cacheControl' in block),
  cachedBlockCount: systemPromptBlocks.filter(block => 'cacheControl' in block).length,
  totalCachedTokens: estimatedCachedTokens,
});
```

### 2. Add Cache Verification
Create a method to verify cache is working:
```typescript
async verifyCacheWorking(): Promise<boolean> {
  // Make two identical requests and compare token usage
  const request1 = await this.createChatCompletion(...);
  const request2 = await this.createChatCompletion(...);
  
  return request2.cacheReadTokens > 0;
}
```

### 3. Cache Metrics Dashboard
Add a cache metrics summary:
```typescript
interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalCacheSavings: number;
  averageCacheHitRatio: number;
}
```

## Next Steps

1. **Examine Full Metadata**: Log the complete metadata structure to identify correct field names
2. **Test with Different Models**: Try different Claude models to see if caching behavior differs
3. **Contact AWS Support**: If cache fields are missing, verify with AWS that caching is enabled for your account/region
4. **Implement Fallback**: If AWS doesn't provide cache metrics, estimate based on repeated prompts