# Fake Tool Execution Handling Guide

## Overview
This guide explains how the system handles cases where the AI attempts to simulate or "hallucinate" tool results instead of actually executing the provided tools.

## The Problem
Sometimes, AI models may generate responses that look like tool execution results without actually calling the tool functions. This can happen when:
- The AI tries to be helpful by guessing what the tool might return
- The model has been trained on similar patterns and attempts to replicate them
- There's confusion about how to properly use the tool calling mechanism

Example of fake tool execution:
```
User: "Show me system indexes"
AI: "### Tool: get_system_indexes
# System Indexes (82 results)
[Made-up JSON data that wasn't actually retrieved]"
```

## Detection Mechanism

The system uses `ToolExecutionVerifier` class to detect fake tool execution by:

1. **Pattern Matching**: Checking for common tool result patterns in the response:
   - `### Tool:`
   - `# Tool:`
   - `**Tool:**`
   - `Tool:` followed by tool names

2. **Stop Reason Verification**: If the stop reason is `end_turn` but the response contains tool patterns, it indicates the AI simulated the results instead of using `tool_use` stop reason.

## Solution: Internal Retry with Stronger Instructions

### Previous Behavior (Problematic)
- System would display a technical error message to the user
- Error message contained implementation details not suitable for end users
- No attempt to recover from the situation

### New Behavior (Fixed)
1. **Detection**: System detects fake tool execution
2. **Logging**: Error is logged internally for debugging
3. **Retry**: System automatically retries with a stronger prompt:
   ```
   "I notice you tried to simulate tool results instead of actually 
   executing tools. Please try again and use the actual tool functions 
   provided. Do not make up or simulate tool results. Use the proper 
   tool calling mechanism."
   ```
4. **User-Friendly Fallback**: If retry fails, show a generic message:
   ```
   "I apologize, but I'm having trouble accessing the tools needed 
   to answer your question. Please try rephrasing your request or 
   asking a different question."
   ```

## Implementation Details

### Key Components

1. **Detection Flag**:
   ```typescript
   let fakeToolExecutionDetected = false;
   ```

2. **Detection Logic**:
   ```typescript
   if (ToolExecutionVerifier.detectFakeToolExecution(fullResponseText, stopReason)) {
     log("🚨 [BedrockChat] Detected fake tool execution", {...});
     fakeToolExecutionDetected = true;
     // Don't yield error to user
   }
   ```

3. **Retry Mechanism**:
   ```typescript
   if (fakeToolExecutionDetected && stopReason === "end_turn") {
     // Build retry messages with stronger instructions
     // Attempt retry with incremented recursion depth
     // Show user-friendly message only if retry fails
   }
   ```

## Benefits

1. **Better User Experience**: Users don't see confusing technical error messages
2. **Automatic Recovery**: System attempts to fix the issue automatically
3. **Proper Logging**: Technical details are logged for debugging without exposing them to users
4. **Graceful Degradation**: If retry fails, users get a helpful suggestion to rephrase

## Testing

To test fake tool execution handling:

1. Monitor logs for "🚨 [BedrockChat] Detected fake tool execution"
2. Verify no technical error messages appear in user-facing output
3. Confirm retry attempts are made with stronger instructions
4. Check that user-friendly fallback message appears if retry fails

## Future Improvements

1. **Multiple Retry Strategies**: Try different prompting strategies if first retry fails
2. **Context Analysis**: Analyze why fake execution occurred to improve prompts
3. **Metrics Tracking**: Track frequency of fake executions to identify patterns
4. **Model-Specific Handling**: Adjust detection and retry strategies per model

## Related Files

- `/src/lib/services/bedrock-chat.ts` - Main implementation
- `ToolExecutionVerifier` class - Detection logic
- `_createChatCompletion` method - Retry mechanism