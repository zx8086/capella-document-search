# Bedrock Chat Context Management Guide

## Overview
This guide explains the context management improvements implemented to prevent AI responses from being truncated due to large tool outputs that exhaust the available context window.

## The Problem
When tools return large outputs (e.g., `get_system_indexes` returning 105 indexes), the response can consume most of the available context window, causing the AI to:
1. Generate only a few tokens (e.g., 3 tokens) before stopping
2. Fail to provide meaningful analysis or answers
3. Leave users confused about why the response stopped abruptly

## Implemented Solutions

### 1. User Notifications for Truncated Responses
The system now detects and notifies users when responses are truncated:

#### Detection Logic:
```typescript
// Check for explicit max_tokens limit hit
if (continuationStopReason === "max_tokens") {
  // Notify user about truncation
}

// Check for abnormally short responses (< 10 tokens)
if (continuationStopReason === "end_turn" && outputTokens < 10) {
  // Notify user about context exhaustion
}
```

#### User-Facing Messages:
- Clear indication that the response was truncated
- Explanation of why it happened (large tool output)
- Context usage percentage estimate
- Actionable suggestions for how to proceed

### 2. Tool Output Size Management

#### A. Automatic Truncation for Large Results
Tools that can return unbounded results now implement automatic truncation:

```typescript
// Maximum characters for tool output to prevent context exhaustion
const MAX_TOOL_OUTPUT_SIZE = 50000; // ~12.5k tokens

// For tools returning large datasets
if (responseText.length > MAX_TOOL_OUTPUT_SIZE) {
  const truncated = responseText.substring(0, MAX_TOOL_OUTPUT_SIZE);
  return {
    success: true,
    content: truncated + "\n\n⚠️ **Output truncated** - Result was too large. Please use more specific filters or request a summary.",
    data: {
      ...data,
      truncated: true,
      originalSize: responseText.length,
      truncatedSize: MAX_TOOL_OUTPUT_SIZE
    }
  };
}
```

#### B. Result Count Limits
Tools now enforce reasonable default limits:

```typescript
// Example: get_system_indexes with automatic limit
const MAX_INDEXES_DEFAULT = 20;
const effectiveLimit = Math.min(rows.length, MAX_INDEXES_DEFAULT);

if (rows.length > effectiveLimit) {
  const limitedRows = rows.slice(0, effectiveLimit);
  responseText = `# System Indexes (showing ${effectiveLimit} of ${rows.length} total)\n\n` +
    `⚠️ Showing first ${effectiveLimit} results. Use filters to see specific indexes.\n\n` +
    `\`\`\`json\n${JSON.stringify(limitedRows, null, 2)}\n\`\`\``;
}
```

### 3. Pre-Execution Warnings
For tools known to return large outputs, the system can warn before execution:

```typescript
// Tools that typically return large outputs
const LARGE_OUTPUT_TOOLS = [
  'get_system_indexes',
  'get_detailed_indexes',
  'get_prepared_statements',
  'get_detailed_prepared_statements'
];

if (LARGE_OUTPUT_TOOLS.includes(toolName)) {
  log("⚠️ [Tool] Executing tool known for large outputs", {
    toolName,
    warning: "This tool may return large results that could impact context availability"
  });
}
```

### 4. Smart Result Summarization
For tools returning structured data, provide summary instead of full output:

```typescript
// Instead of returning all 105 indexes as JSON
const summaryText = `# System Indexes Summary

**Total Indexes**: ${rows.length}

**By Type**:
- Primary: ${primaryCount}
- Secondary: ${secondaryCount}
- Array: ${arrayCount}

**By State**:
- Online: ${onlineCount}
- Building: ${buildingCount}
- Deferred: ${deferredCount}

To see specific indexes, use filters like:
- View indexes for a specific keyspace
- Search by index name pattern
- Filter by index type or state`;
```

## Best Practices for Tool Implementation

### 1. Always Implement Result Limits
```typescript
// Bad: No limit, can return unbounded results
const result = await cluster.query(query);
return { content: JSON.stringify(result.rows) };

// Good: Enforced limit with user notification
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const effectiveLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
```

### 2. Provide Summary Options
```typescript
interface ToolInput {
  limit?: number;
  summary?: boolean; // Add summary option
}

if (input.summary) {
  return generateSummary(results);
} else {
  return generateDetailedOutput(results, input.limit);
}
```

### 3. Use Progressive Disclosure
```typescript
// First response: Overview
"Found 105 indexes across 15 keyspaces. Would you like to:"
"1. See indexes for a specific keyspace"
"2. Search for indexes by name"
"3. View index statistics summary"
```

### 4. Implement Pagination
```typescript
interface PaginatedToolInput {
  limit?: number;
  offset?: number;
  page?: number;
}

// Return metadata for pagination
return {
  content: paginatedContent,
  data: {
    results: pageResults,
    totalCount: totalResults,
    currentPage: page,
    totalPages: Math.ceil(totalResults / limit),
    hasMore: offset + limit < totalResults
  }
};
```

## User Guidance Messages

### When Context is Exhausted:
```
⚠️ **The response was cut short** (only 3 tokens generated). This typically happens when:
- The tool output was too large (72,269 characters)
- Context window is nearly full (approximately 90% used)

**Suggestions:**
- Ask for specific information from the tool results
- Request a summary of particular sections
- Start a new conversation for complex analyses
```

### When Output is Truncated:
```
⚠️ **Output truncated** - Result contained 105 items but only showing first 20.
To see more results:
- Use specific filters (e.g., keyspace name)
- Request results in batches
- Ask for a summary instead of full details
```

## Testing Context Management

### 1. Test Large Output Handling
```bash
# Test with get_system_indexes (known to return many results)
User: "Show me all system indexes"
# Should see truncated output with guidance

# Test with specific request
User: "Show me indexes for the 'travel-sample' bucket only"
# Should see filtered, manageable output
```

### 2. Test Context Exhaustion Detection
```bash
# Fill context with large outputs
User: "Show me all system indexes, then all prepared statements"
# Should see warning when context is nearly full
```

### 3. Test Summary Functionality
```bash
User: "Give me a summary of system indexes"
# Should see high-level statistics instead of full JSON
```

## Future Enhancements

1. **Adaptive Output Sizing**: Dynamically adjust output size based on remaining context
2. **Streaming Large Results**: Stream results in chunks for progressive analysis
3. **Context Budget Tracking**: Show users their "context budget" usage
4. **Smart Caching**: Cache large tool outputs for reference without re-execution
5. **Tool Chaining Optimization**: Warn before executing multiple large-output tools

## Conclusion
These improvements ensure that users receive meaningful responses even when working with tools that can return large amounts of data. The system now gracefully handles context limitations and provides clear guidance for effective tool usage.