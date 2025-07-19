# Fix TypeScript Errors Task Plan

## Goal
Fix all TypeScript errors in the project, focusing on:
1. OpenTelemetry Resource import issue
2. Missing `err` import in api.ts
3. Version mismatch issues with OpenTelemetry packages
4. Other type errors

## Todo Items

- [ ] Fix the missing `err` import in `/src/lib/api.ts`
- [ ] Fix OpenTelemetry Resource import issue in `/src/instrumentation.ts`
- [ ] Update OpenTelemetry package versions to resolve compatibility issues
- [ ] Fix GrowthBookProvider type issues in `/src/lib/openfeature/GrowthBookProvider.ts`
- [ ] Fix health check page type errors in `/src/routes/api/health-check/+page.svelte`
- [ ] Fix health check server type errors in `/src/routes/api/health-check/+server.ts`
- [ ] Fix vector search server type error in `/src/routes/api/vector-search/+server.ts`
- [ ] Fix login page type errors in `/src/routes/login/+page.svelte`
- [ ] Run `bun run check` to verify all fixes

## Notes
- The main issue appears to be version mismatches in OpenTelemetry packages
- Some imports are missing (like `err` from unifiedLogger)
- Several type assertions and proper type definitions are needed