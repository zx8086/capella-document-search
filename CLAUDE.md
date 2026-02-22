# CLAUDE.md

## Project Overview

Capella Document Search: Modern document search application for intelligent searching across Couchbase Capella scopes and collections. Features AI-powered chat using RAG (Retrieval-Augmented Generation) with AWS Bedrock and Pinecone for semantic document querying.

**Stack**: TypeScript/Bun, Svelte 5/SvelteKit, Couchbase Capella, Pinecone, AWS Bedrock, LangChain

## Project Structure

```
src/
├── lib/
│   ├── components/          # Reusable Svelte components
│   ├── config/              # Configuration files
│   ├── rag/                 # RAG providers and types
│   ├── services/            # Business logic services (bedrock-chat, couchbase-service)
│   ├── stores/              # Svelte stores
│   └── utils/               # Utility functions
├── models/                  # TypeScript type definitions
├── otel/                    # OpenTelemetry configuration
├── routes/                  # SvelteKit routes and API endpoints
│   └── api/                 # REST API endpoints
└── utils/                   # Shared utilities
guides/                      # Implementation guides and documentation
```

## Critical Rules

### Workflow
- **NEVER commit** without explicit user authorization
- **Team**: "Siobytes" | Commit format: `SIO-XX: message`
- Linear Project: [Capella Document Search](https://linear.app/siobytes/project/capella-document-search-fdd6c229b8a5)
- **ALWAYS add Linear issues to the "Capella Document Search" project** when creating new issues

### Linear Issue Management
- **Assignee**: Always assign issues to "me" (Simon Owusu)
- **Epic naming**: `Epic N: <Title>` (e.g., `Epic 1: Migrate AI Agent to LangGraph`)
- **Sub-issue naming**: `<Phase>.<Order>: <Title>` (e.g., `1.1: Infrastructure Setup`, `2.3: Migrate index tools`)
- **Phase grouping**:
  - Phase 1.x: Foundation/Setup
  - Phase 2.x: Core implementation
  - Phase 3.x: Component implementation
  - Phase 4.x: Assembly/Integration
  - Phase 5.x: Testing/Cleanup

### Code
- **Bun runtime only** - use `bun` commands, never `node`/`npm`
- **No emojis** in code, logs, or output
- **Tailwind CSS only** - use Tailwind utility classes for all styling, never custom CSS in `<style>` blocks
- **Svelte 5 patterns** - use `$state()` and `$derived()` for reactivity
- **Type safety** - maintain TypeScript strict mode

### Comments (Token Reduction)

**File headers**: Single-line relative path only: `// src/services/bedrock-chat.ts`

**ALWAYS REMOVE**:
- Multi-line file header JSDoc blocks
- JSDoc that restates function/parameter names
- `@returns` that describes obvious return types
- Section separator comments (`// ============`)

**ALWAYS KEEP**:
- Zod `.describe()` calls (runtime values)
- Business logic "why" comments (not "what")
- Ticket references (`SIO-XXX`)
- Algorithm explanations for non-obvious logic

### Servers
- Frontend: port 5173 (dev server)
- Trust HMR - never kill running servers
- **NEVER kill or restart running servers** - HMR handles code changes

## Essential Commands

```bash
# Development
bun run dev                    # Start development server (localhost:5173)
bun run build                  # Production build
bun run preview                # Preview production build
bun run start                  # Start production server

# Testing
bun test                       # Run unit tests
bun run test:watch             # Watch mode for tests
playwright test                # Run E2E tests

# Type checking
bun run check                  # Type checking
bun run check:watch            # Watch mode type checking

# Docker
bun run docker:dev             # Build and run dev container
bun run docker:prod            # Build and run prod container
bun run docker:clean           # Clean docker resources
```

## Core Technologies

- **Runtime**: Bun (JavaScript runtime and package manager)
- **Frontend**: SvelteKit 5 with TypeScript and Tailwind CSS
- **Database**: Couchbase Capella for document storage
- **Vector Search**: Pinecone for RAG implementation
- **AI/ML**: AWS Bedrock (Claude), LangChain, LangSmith
- **Authentication**: Microsoft Azure AD/MSAL
- **Monitoring**: OpenTelemetry, OpenReplay, LangSmith
- **GraphQL**: Houdini for code generation

## Architecture Overview

### Frontend (SvelteKit 5)
- Uses modern Svelte 5 reactivity with `$state()` and `$derived()`
- Component-based architecture in `/src/lib/components/`
- File-based routing with API routes in `/src/routes/api/`
- Svelte stores for global state management
- Tailwind CSS for styling

### Backend Architecture
- SvelteKit server-side rendering with API routes
- RESTful endpoints for document search, collections, and chat
- Microsoft Azure AD authentication integration
- Couchbase Capella for document storage
- Pinecone vector database for semantic search
- Custom RAG providers (Capella, Pinecone, AWS Knowledge Base, Vectorize)

### Key Features
- **Document Search**: Single document key search across collections
- **Bulk Upload**: CSV file upload for batch document searches
- **AI Chat**: AWS Bedrock-powered chat with RAG integration
- **Collection Management**: Dynamic collection selection
- **Suggested Queries**: Context-aware query suggestions

## Key Files

- `src/lib/services/bedrock-chat.ts` - AI chat service with AWS Bedrock
- `src/lib/services/couchbase-service.ts` - Couchbase database operations
- `src/lib/rag/` - RAG providers and types
- `src/lib/config/` - Configuration files
- `src/routes/api/chat/+server.ts` - Chat API endpoint
- `src/routes/api/vector-search/+server.ts` - Vector search endpoint

## Configuration Management

- Uses Zod for type-safe environment configuration
- Environment schema in `/src/env/schema.ts`
- Environment-specific files (`.env.development`, `.env.production`)
- Configuration files in `/src/lib/config/`
- Required: Azure AD, AWS Bedrock, Pinecone, and Couchbase settings

## Monitoring & Observability

- **OpenTelemetry**: Comprehensive tracing and metrics in `/src/otel/`
- **LangSmith**: AI/LLM tracing and evaluation
- **OpenReplay**: Session replay for debugging
- **Structured Logging**: Custom logger utilities

## LangSmith Tracing

Use `langsmith-fetch` CLI to investigate RAG agent traces for validation and debugging.

**Claude Code Usage**: Use inline env vars (the `$(...)` syntax causes shell parsing issues):

```bash
# Get API key from .env.development
grep "^LANGSMITH_API_KEY=" .env.development

# ALWAYS use batch `traces` command (single `trace <id>` returns incomplete data)
LANGSMITH_API_KEY=<key> LANGSMITH_PROJECT=capella-document-search /Users/Simon.Owusu@Tommy.com/.local/bin/langsmith-fetch traces /tmp/traces --limit 5 --include-metadata

# Then read JSON files from /tmp/traces/ for complete trace data
```

**Human Setup**: Export the API key before running commands:

```bash
export LANGSMITH_API_KEY=$(grep "^LANGSMITH_API_KEY=" .env.development | cut -d'=' -f2-)
```

**Commands**:

```bash
# Fetch recent traces to a directory (recommended for analysis)
langsmith-fetch traces /tmp/traces --limit 5 --include-metadata

# Fetch recent threads (full conversations with all traces)
langsmith-fetch threads /tmp/threads --limit 3 --include-metadata --include-feedback

# Fetch specific trace by ID (from LangSmith UI or logs)
langsmith-fetch trace <trace-id> --format pretty

# Fetch specific thread by ID
langsmith-fetch thread <thread-id> --format pretty

# Fetch traces from last 30 minutes
langsmith-fetch traces /tmp/traces --limit 10 --last-n-minutes 30

# Export as raw JSON for piping to jq
langsmith-fetch trace <trace-id> --format raw | jq .
```

**Key Flags**:

| Flag | Description |
|------|-------------|
| `--format pretty\|json\|raw` | Output format (pretty for readable, raw for piping) |
| `--include-metadata` | Add status, timing, tokens, costs |
| `--include-feedback` | Include user feedback data |
| `--last-n-minutes <int>` | Filter to recent period |
| `--limit <int>` | Maximum records to fetch |

**When to use**:

- Validate RAG responses and Pinecone retrieval after testing via Chrome DevTools MCP
- Debug LangGraph agent behavior and conversation flow
- Verify suggested query generation
- Check tool usage patterns (document search, vector search)
- Investigate hallucinations or incorrect document citations

## Documentation Guidelines

- Always place implementation guides and technical documentation in the `/guides/` folder
- Implementation guides should follow the naming pattern: `[FEATURE]_[TYPE]_GUIDE.md` (e.g., `BEDROCK_CHAT_IMPROVEMENTS.md`)

## Security Considerations

- CSP (Content Security Policy) configuration
- Protected routes and API endpoints
- Secure environment variable handling
- Azure AD authentication guards
- Input validation and sanitization for document search

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5173 in use | `lsof -ti:5173 \| xargs kill -9` |
| HMR not working | Check terminal for errors, restart dev server |
| Auth failures | Verify Azure AD config in `.env` |
| Couchbase connection | Check `COUCHBASE_CONNECTION_STRING` and credentials |
