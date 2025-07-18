# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Capella Document Search is a modern document search application built with SvelteKit 5 and Bun. It provides document search capabilities across Capella scopes and collections with AI-powered chat functionality using RAG (Retrieval-Augmented Generation).

## Core Technologies

- **Runtime**: Bun (JavaScript runtime and package manager)
- **Frontend**: SvelteKit 5 with TypeScript and Tailwind CSS
- **Database**: Couchbase for document storage
- **Vector Search**: Pinecone for RAG implementation
- **AI/ML**: OpenAI GPT-4, Langchain, Hugging Face
- **Authentication**: Microsoft Azure AD/MSAL
- **Monitoring**: OpenTelemetry, OpenReplay, Elastic APM
- **GraphQL**: Houdini for code generation

## Development Commands

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
- Couchbase database for document storage
- Pinecone vector database for semantic search
- Custom RAG providers (Capella, Pinecone, Vectorize)

### Key Features
- **Document Search**: Single document key search across collections
- **Bulk Upload**: CSV file upload for batch document searches
- **AI Chat**: OpenAI-powered chat with RAG integration
- **Collection Management**: Dynamic collection selection
- **Real-time Updates**: WebSocket-like functionality

## Project Structure

```
src/
├── lib/
│   ├── components/          # Reusable Svelte components
│   ├── config/             # Configuration files
│   ├── rag/               # RAG providers and types
│   ├── services/          # Business logic services
│   ├── stores/            # Svelte stores
│   └── utils/             # Utility functions
├── models/                # TypeScript type definitions
├── otlp/                  # OpenTelemetry configuration
├── routes/                # SvelteKit routes and API endpoints
└── utils/                 # Shared utilities
```

## Configuration Management

- Uses Zod for type-safe environment configuration
- Environment-specific files (`.env.development`, `.env.production`)
- Configuration files in `/src/lib/config/`
- Azure AD, OpenAI, Pinecone, and Couchbase settings required

## Testing Setup

- **Unit Tests**: Bun test runner for TypeScript/JavaScript tests
- **E2E Tests**: Playwright with authentication flow testing
- **Authentication Testing**: MSAL integration with Azure AD
- Screenshots captured on test failures

## Monitoring & Observability

- **OpenTelemetry**: Comprehensive tracing and metrics in `/src/otlp/`
- **Custom OTLP Exporters**: Monitored exporters for logs, metrics, traces
- **OpenReplay**: Session replay for debugging
- **Structured Logging**: Winston with ECS format

## Docker Configuration

- Multi-stage builds with optimization
- Platform-specific builds (arm64/amd64)
- Environment-specific configurations
- Comprehensive .dockerignore for build optimization

## Development Notes

- Use Bun as the package manager (not npm/yarn)
- Follow SvelteKit 5 patterns with `$state()` and `$derived()`
- Maintain type safety with TypeScript strict mode
- Follow the existing component structure and naming conventions
- Ensure all new features integrate with OpenTelemetry tracing
- Test authentication flows with MSAL integration

## Security Considerations

- CSP (Content Security Policy) configuration
- Protected routes and API endpoints
- Secure environment variable handling
- Azure AD authentication guards
- Input validation and sanitization for document search