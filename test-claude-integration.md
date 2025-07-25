# Claude Integration Test Plan

## Changes Made

1. **Model Configuration Updated**
   - Changed default model from `eu.amazon.nova-pro-v1:0` to `anthropic.claude-3-5-sonnet-20241022-v2:0`
   - Updated in: backend-config.ts, env-config.ts, bedrock-chat.ts, .env.example

2. **Claude 4 Prompt Engineering**
   - Implemented structured XML tags for context
   - Replaced negative instructions with positive guidelines
   - Added clear role definition and formatting guidelines

3. **Extended Thinking Feature**
   - Added toggle switch in chat UI header
   - Passes `enableExtendedThinking` flag to API
   - When enabled, adds `<thinking>` tags to system prompt

4. **Token Usage Extraction**
   - Added handler for Claude's metadata event in stream
   - Removed token estimation logic
   - Properly extracts actual usage from Claude responses

5. **Pricing Configuration**
   - Added Claude 3.5 Sonnet pricing ($3/1M input, $15/1M output tokens)
   - Updated cost calculation to use model-specific pricing

## Test Steps

### 1. Basic Chat Functionality
- [ ] Start the development server: `bun run dev`
- [ ] Open the chat interface
- [ ] Send a simple message: "What is Couchbase?"
- [ ] Verify response is generated using Claude model
- [ ] Check console logs for token usage extraction

### 2. Extended Thinking Toggle
- [ ] Enable the "Extended Thinking" toggle in chat header
- [ ] Send a complex query: "Explain the differences between N1QL indexes and FTS indexes in Couchbase"
- [ ] Verify the response shows more detailed reasoning
- [ ] Check that thinking process is hidden from user view

### 3. Tool Execution
- [ ] Send a query that triggers tool use: "Show me the system vitals"
- [ ] Verify tools execute correctly with Claude
- [ ] Check that tool results are properly formatted
- [ ] Verify token usage is tracked for tool responses

### 4. Token Usage & Cost Tracking
- [ ] Send several messages
- [ ] Check console logs for token usage data
- [ ] Verify costs are calculated with Claude pricing
- [ ] Check usage tracking service records correct data

### 5. Health Check
- [ ] Access `/api/health-check`
- [ ] Verify Bedrock Chat section shows Claude model
- [ ] Confirm health check passes with new model

### 6. Error Handling
- [ ] Test with invalid API credentials
- [ ] Test with network interruption
- [ ] Verify error messages are user-friendly

## Expected Results

1. **Model Response**: Responses should be from Claude 3.5 Sonnet v2
2. **Token Usage**: Should show actual token counts, not estimates
3. **Extended Thinking**: When enabled, responses should be more thorough
4. **Cost Calculation**: Should reflect Claude pricing (higher than Nova)
5. **All Tools**: Should work seamlessly with Claude model

## Verification Commands

```bash
# Check environment variable
echo $BEDROCK_CHAT_MODEL

# Monitor logs for token usage
bun run dev | grep -E "Token usage|BedrockChat"

# Test health endpoint
curl http://localhost:5173/api/health-check | jq .
```

## Rollback Plan

If issues arise, revert to Nova model by:
1. Setting `BEDROCK_CHAT_MODEL=eu.amazon.nova-pro-v1:0` in .env
2. Restarting the server