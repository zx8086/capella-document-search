# Bedrock Chat Tool Validation Improvements

## Problem Statement
When the AI agent calls tools with incorrect input format (e.g., passing `10` instead of `{limit: 10}`), it fails validation and shows an error to the user instead of automatically retrying with the correct format.

## Solution Overview

### 1. Input Sanitization
Before validation, attempt to correct common input format mistakes:
- Bare numbers → `{limit: number}` for query-related tools
- Bare strings → appropriate object format based on tool expectations

### 2. Retry Mechanism
When a tool fails due to validation errors:
- Parse the error message to understand what went wrong
- Attempt to fix the input format
- Retry the tool call with corrected input
- Limit retries to prevent infinite loops

### 3. Enhanced Error Messages
Provide clearer guidance on expected formats when validation fails, including examples.

## Implementation Details

### Enhanced Validation Function
```typescript
// Add input sanitization before validation
function sanitizeToolInput(toolName: string, input: unknown): unknown {
  // Handle bare values for common patterns
  if (typeof input === 'number' && toolName.includes('queries')) {
    return { limit: input };
  }
  // Add more sanitization patterns as needed
  return input;
}

// Enhanced validation with better error messages
function validateToolInputWithHints(toolName: string, input: unknown) {
  const sanitized = sanitizeToolInput(toolName, input);
  const result = validateToolInput(toolName, sanitized);
  
  if (!result.success) {
    // Add format hints to error message
    const hints = getFormatHints(toolName);
    return {
      ...result,
      error: `${result.error}. Expected format: ${hints}`,
      sanitized
    };
  }
  
  return result;
}
```

### Tool Execution with Retry
```typescript
private async executeToolWithRetry(
  name: string, 
  input: any, 
  parentRunTree?: RunTree,
  retryCount: number = 0
): Promise<ToolExecutionResult> {
  const maxRetries = 2;
  
  // First attempt with sanitization
  const validation = validateToolInputWithHints(name, input);
  
  if (!validation.success && retryCount < maxRetries) {
    // Log the retry attempt
    log("🔄 [Tool] Retrying with sanitized input", {
      toolName: name,
      originalInput: input,
      sanitizedInput: validation.sanitized,
      retryCount: retryCount + 1
    });
    
    // Retry with sanitized input
    return this.executeToolWithRetry(
      name, 
      validation.sanitized, 
      parentRunTree,
      retryCount + 1
    );
  }
  
  // Continue with normal execution...
}
```

## Benefits
1. **Better User Experience**: Users don't see validation errors for simple format mistakes
2. **Improved AI Agent Behavior**: The agent learns from corrections and improves over time
3. **Reduced Friction**: Common mistakes are automatically corrected
4. **Backward Compatibility**: Existing correct tool calls continue to work as before