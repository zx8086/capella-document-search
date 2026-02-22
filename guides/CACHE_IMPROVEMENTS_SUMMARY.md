# Cache Token Tracking Improvements Summary

## Issue
Cache metrics were showing zeros in the logs despite having cache blocks configured:
- `cacheCreationTokens: 0`
- `cacheReadTokens: 0`
- `cacheHitRatio: 0`
- `cacheSavings: 0`

## Root Cause
AWS Bedrock uses different field names for cache metrics than expected:
- We were looking for: `cacheCreationInputTokens`
- AWS provides: `cacheWriteInputTokens`

## Fixes Implemented

### 1. Corrected Field Names
```typescript
// Before
const cacheCreationTokens = event.metadata.usage.cacheCreationInputTokens || 0;

// After
const cacheCreationTokens = event.metadata.usage.cacheWriteInputTokens || 0;
```

### 2. Enhanced Cache Debugging
Added comprehensive logging to track cache behavior:

```typescript
// Log when cache blocks are created
log("📦 [BedrockChat] Created cached system prompt block", {
  blockLength: systemPrompt.length,
  estimatedTokens: Math.ceil(systemPrompt.length / 4),
  cacheConfig: this.CACHE_CONFIG,
});

// Log full usage object for debugging
log("📊 [BedrockChat] Full usage object for cache debugging", {
  allUsageFields: Object.keys(event.metadata.usage),
  fullUsage: JSON.stringify(event.metadata.usage, null, 2),
});

// Additional cache analysis
if (cacheReadTokens > 0 || cacheCreationTokens > 0) {
  log("✅ [BedrockChat] Cache is working!", {
    cacheType: cacheReadTokens > 0 ? "cache_hit" : "cache_creation",
    tokensSaved: cacheReadTokens,
    costSaved: cacheSavings.toFixed(4),
  });
}
```

### 3. Better Cache Status Reporting
Added warnings when cache blocks exist but no usage is reported:

```typescript
if (systemPromptBlocks.some(block => 'cacheControl' in block)) {
  log("⚠️ [BedrockChat] Cache blocks present but no cache usage reported", {
    possibleReasons: [
      "First request with this prompt (cache being created)",
      "Model/region doesn't support caching",
      "Cache expired (5 minute TTL)",
      "AWS Bedrock not reporting cache metrics"
    ],
  });
}
```

## Expected Behavior After Fix

### First Request (Cache Write)
```json
{
  "cacheReadTokens": 0,
  "cacheWriteTokens": 1500,  // System prompt tokens being cached
  "cacheHitRatio": 0,
  "cacheSavings": 0
}
```

### Subsequent Requests (Cache Hit)
```json
{
  "cacheReadTokens": 1500,   // Tokens read from cache
  "cacheWriteTokens": 0,
  "cacheHitRatio": 0.75,     // High percentage of input from cache
  "cacheSavings": 0.0041     // Cost savings from cache usage
}
```

## Monitoring Cache Performance

The system now provides clear visibility into cache performance:
1. **Cache Block Creation**: Logged when system prompts are cached
2. **Cache Usage Metrics**: Tracked on every request
3. **Cache Effectiveness**: Hit ratio and cost savings calculated
4. **Debugging Support**: Full usage object logged for troubleshooting

## Notes
- Cache TTL is 5 minutes (managed by AWS)
- Minimum 1024 tokens required for caching
- Cache is most effective with consistent system prompts
- Model must support caching (Claude 3 models do)