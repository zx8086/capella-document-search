# Fix TypeScript Errors & AWS RAG Tracing Task Plan

## Goal
1. Fix all TypeScript errors in the project
2. Fix AWS RAG tool calling trace hierarchy and output stream capture

## Todo Items

### TypeScript Fixes
- [ ] Fix the missing `err` import in `/src/lib/api.ts`
- [ ] Fix OpenTelemetry Resource import issue in `/src/instrumentation.ts`
- [ ] Update OpenTelemetry package versions to resolve compatibility issues
- [ ] Fix GrowthBookProvider type issues in `/src/lib/openfeature/GrowthBookProvider.ts`
- [ ] Fix health check page type errors in `/src/routes/api/health-check/+page.svelte`
- [ ] Fix health check server type errors in `/src/routes/api/health-check/+server.ts`
- [ ] Fix vector search server type error in `/src/routes/api/vector-search/+server.ts`
- [ ] Fix login page type errors in `/src/routes/login/+page.svelte`
- [ ] Run `bun run check` to verify all fixes

### AWS RAG Tracing Fixes
- [x] Fix tool calling trace hierarchy in BedrockChatService to properly nest under parent trace
- [x] Fix Response Stream Capture to properly capture and display streaming output
- [x] Update tracing tags and metadata for better tool execution visibility
- [ ] Test tool calling with queries that trigger tools and verify trace hierarchy

## Notes
- The main issue appears to be version mismatches in OpenTelemetry packages
- Some imports are missing (like `err` from unifiedLogger)
- Several type assertions and proper type definitions are needed
- AWS RAG tool execution now properly inherits parent trace context
- Response stream capture now accumulates and logs complete response for LangSmith