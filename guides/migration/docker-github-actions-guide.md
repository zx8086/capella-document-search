# Docker & GitHub Actions Implementation Guide
## Based on AWS Cost Analyzer Best Practices

**Purpose:** Replicable patterns for containerizing Bun/Svelte applications and automating CI/CD with GitHub Actions.  
**Source Project:** AWS Cost Analysis & Forecasting Platform  
**Stack:** Bun (backend), Svelte (frontend), Docker, GitHub Actions

---

## Table of Contents

- [1. Docker Architecture Overview](#1-docker-architecture-overview)
- [2. Dockerfile — Bun Backend (Multi-Stage)](#2-dockerfile--bun-backend-multi-stage)
- [3. Dockerfile — Svelte Frontend (Multi-Stage)](#3-dockerfile--svelte-frontend-multi-stage)
- [4. .dockerignore](#4-dockerignore)
- [5. Docker Compose — Development](#5-docker-compose--development)
- [6. Docker Compose — Production](#6-docker-compose--production)
- [7. Docker Compose — Full Stack with Services](#7-docker-compose--full-stack-with-services)
- [8. Health Checks](#8-health-checks)
- [9. Environment Variable Management](#9-environment-variable-management)
- [10. GitHub Actions — CI Pipeline](#10-github-actions--ci-pipeline)
- [11. GitHub Actions — Docker Build & Push](#11-github-actions--docker-build--push)
- [12. GitHub Actions — Scheduled Jobs](#12-github-actions--scheduled-jobs)
- [13. GitHub Actions — Environment Deployments](#13-github-actions--environment-deployments)
- [14. GitHub Actions — Reusable Workflows](#14-github-actions--reusable-workflows)
- [15. Secret Management](#15-secret-management)
- [16. Security Best Practices](#16-security-best-practices)
- [17. Checklist for New Projects](#17-checklist-for-new-projects)

---

## 1. Docker Architecture Overview

The containerization strategy follows these principles:

- **Multi-stage builds** — separate install, build, and runtime stages to minimize image size
- **Non-root users** — never run containers as root in production
- **Health checks** — every service has a health endpoint and Docker HEALTHCHECK
- **Environment parity** — dev/staging/prod use the same image, configured via env vars
- **Layer caching** — dependency install before source copy for fast rebuilds
- **Minimal base images** — `oven/bun:slim` or `alpine` for smallest attack surface

```
┌─────────────────────────────────────────────┐
│  GitHub Actions CI/CD                        │
│  ┌──────┐  ┌──────┐  ┌────────┐  ┌───────┐ │
│  │ Lint │→│ Test │→│  Build  │→│ Push  │ │
│  └──────┘  └──────┘  └────────┘  └───────┘ │
└──────────────────────────────┬──────────────┘
                               ▼
┌─────────────────────────────────────────────┐
│  Docker Compose (per environment)            │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ bun-api │  │ svelte   │  │ neo4j /    │ │
│  │ :3000   │  │ :5173    │  │ couchbase  │ │
│  └─────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 2. Dockerfile — Bun Backend (Multi-Stage)

```dockerfile
# ============================================
# Stage 1: Install dependencies
# ============================================
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json bun.lockb ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Install ALL dependencies (including devDeps for build)
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# ============================================
# Stage 2: Build
# ============================================
FROM oven/bun:1 AS build

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript (if using bundler)
RUN bun build ./src/index.ts \
    --outdir ./dist \
    --target bun \
    --minify

# ============================================
# Stage 3: Production runtime
# ============================================
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy only what's needed
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

CMD ["bun", "run", "dist/index.js"]
```

### Simpler Alternative (No Bundling)

If you're running Bun directly without bundling (common for APIs):

```dockerfile
FROM oven/bun:1-slim AS runtime

WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY src/ ./src/
COPY tsconfig.json ./

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

ENV NODE_ENV=production
ENV PORT=3000

CMD ["bun", "run", "src/index.ts"]
```

---

## 3. Dockerfile — Svelte Frontend (Multi-Stage)

```dockerfile
# ============================================
# Stage 1: Build the Svelte app
# ============================================
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

# Build args for compile-time env vars
ARG PUBLIC_API_URL
ARG PUBLIC_APP_ENV=production
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_APP_ENV=$PUBLIC_APP_ENV

RUN bun run build

# ============================================
# Stage 2: Serve with nginx
# ============================================
FROM nginx:alpine AS runtime

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config
COPY nginx.conf /etc/nginx/conf.d/

# Copy built assets
COPY --from=build /app/build /usr/share/nginx/html

# Non-root nginx (optional, requires config changes)
# RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### nginx.conf for SvelteKit SPA

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health endpoint
    location /health {
        access_log off;
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # API proxy (if backend is co-located)
    location /api/ {
        proxy_pass http://bun-api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA fallback — serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Alternative: SvelteKit with Bun Adapter (SSR)

If using SvelteKit with `adapter-node` and running under Bun:

```dockerfile
FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim AS runtime

WORKDIR /app
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

CMD ["bun", "build/index.js"]
```

---

## 4. .dockerignore

```
# Dependencies
node_modules
.bun

# Build output
dist
build
.svelte-kit

# Version control
.git
.gitignore

# Docker files (prevent recursive copy)
Dockerfile*
docker-compose*
.dockerignore

# IDE
.vscode
.idea
*.swp
*.swo

# Environment (never bake secrets into images)
.env
.env.*
!.env.example

# Testing
coverage
*.test.ts
*.spec.ts
__tests__

# Documentation
*.md
LICENSE
docs/

# OS files
.DS_Store
Thumbs.db

# CI/CD
.github
```

---

## 5. Docker Compose — Development

```yaml
# docker-compose.dev.yml
# Usage: docker compose -f docker-compose.dev.yml up

services:
  api:
    build:
      context: ./packages/api
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      # Hot reload: mount source code
      - ./packages/api/src:/app/src
      - ./packages/api/package.json:/app/package.json
      # Exclude node_modules from mount
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - PORT=3000
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=devpassword
      - COUCHBASE_URL=couchbase://couchbase
      - AWS_REGION=${AWS_REGION:-eu-central-1}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_BEDROCK_MODEL_ID=${AWS_BEDROCK_MODEL_ID:-anthropic.claude-3-5-sonnet-20241022-v2:0}
      - LANGSMITH_API_KEY=${LANGSMITH_API_KEY}
      - LANGSMITH_PROJECT=${LANGSMITH_PROJECT:-cost-analyzer-dev}
    depends_on:
      neo4j:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build:
      context: ./packages/frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./packages/frontend/src:/app/src
      - /app/node_modules
    environment:
      - PUBLIC_API_URL=http://localhost:3000
    depends_on:
      - api

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"   # Browser
      - "7687:7687"   # Bolt
    environment:
      - NEO4J_AUTH=neo4j/devpassword
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_apoc_export_file_enabled=true
      - NEO4J_apoc_import_file_enabled=true
    volumes:
      - neo4j-dev-data:/data
      - neo4j-dev-logs:/logs
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  neo4j-dev-data:
  neo4j-dev-logs:
```

### Dockerfile.dev (Hot Reload)

```dockerfile
# packages/api/Dockerfile.dev
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .

EXPOSE 3000

# --watch enables hot reload
CMD ["bun", "run", "--watch", "src/index.ts"]
```

---

## 6. Docker Compose — Production

```yaml
# docker-compose.prod.yml
# Usage: docker compose -f docker-compose.prod.yml up -d

services:
  api:
    image: ${REGISTRY:-ghcr.io}/${REPO:-your-org/your-app}-api:${TAG:-latest}
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "bun", "--eval", "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    image: ${REGISTRY:-ghcr.io}/${REPO:-your-org/your-app}-frontend:${TAG:-latest}
    ports:
      - "80:80"
    depends_on:
      api:
        condition: service_healthy
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 7. Docker Compose — Full Stack with Services

This mirrors the AWS Cost Analyzer architecture with all supporting services:

```yaml
# docker-compose.yml
# Full stack: API + Frontend + Neo4j + Couchbase

services:
  # ── Backend API ─────────────────────────
  api:
    build:
      context: ./packages/api
      target: runtime
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=${NEO4J_PASSWORD}
      - COUCHBASE_URL=couchbase://couchbase
      - COUCHBASE_BUCKET=${COUCHBASE_BUCKET:-cost-analyzer}
    depends_on:
      neo4j:
        condition: service_healthy
      couchbase:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - backend
      - frontend

  # ── Frontend ────────────────────────────
  frontend:
    build:
      context: ./packages/frontend
      args:
        PUBLIC_API_URL: ${PUBLIC_API_URL:-http://localhost:3000}
    ports:
      - "80:80"
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - frontend

  # ── Neo4j (Graph Relationships) ────────
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-changeme}
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_server_memory_heap_initial__size=512m
      - NEO4J_server_memory_heap_max__size=1G
      - NEO4J_server_memory_pagecache_size=512m
    volumes:
      - neo4j-data:/data
      - neo4j-logs:/logs
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
    networks:
      - backend

  # ── Couchbase (Primary Data Store) ─────
  couchbase:
    image: couchbase:community-7.6.1
    ports:
      - "8091:8091"   # Admin UI
      - "8092:8092"
      - "8093:8093"   # Query
      - "11210:11210" # Data
    volumes:
      - couchbase-data:/opt/couchbase/var
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8091/pools"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
    networks:
      - backend

volumes:
  neo4j-data:
  neo4j-logs:
  couchbase-data:

networks:
  backend:
    driver: bridge
  frontend:
    driver: bridge
```

---

## 8. Health Checks

Every service exposes a `/health` endpoint. This is critical for Docker, load balancers, and GitHub Actions deployment verification.

### Bun API Health Endpoint (Hono)

```typescript
// src/routes/health.ts
import { Hono } from "hono";
import neo4j from "neo4j-driver";

const health = new Hono();

health.get("/health", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  // Check Neo4j
  try {
    const session = driver.session();
    await session.run("RETURN 1");
    await session.close();
    checks.neo4j = "ok";
  } catch {
    checks.neo4j = "error";
  }

  // Check Couchbase
  try {
    await cluster.ping();
    checks.couchbase = "ok";
  } catch {
    checks.couchbase = "error";
  }

  // Check Bedrock (lightweight — just list models)
  try {
    const modelId = process.env.AWS_BEDROCK_MODEL_ID;
    checks.bedrock = modelId ? "ok" : "error";
  } catch {
    checks.bedrock = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return c.json(
    {
      status: allOk ? "healthy" : "degraded",
      version: process.env.APP_VERSION || "unknown",
      uptime: process.uptime(),
      checks,
    },
    allOk ? 200 : 503
  );
});

export default health;
```

### Docker HEALTHCHECK Patterns

```dockerfile
# Bun backend
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

# Nginx frontend
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/health || exit 1

# Neo4j
healthcheck:
  test: ["CMD", "neo4j", "status"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s

# Couchbase
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8091/pools"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

---

## 9. Environment Variable Management

### Pattern: Same image, different config

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  .env.dev    │     │  .env.stg    │     │  .env.prd    │
│              │     │              │     │              │
│ MODEL=haiku  │     │ MODEL=sonnet │     │ MODEL=sonnet │
│ LOG=debug    │     │ LOG=info     │     │ LOG=warn     │
│ REGION=eu    │     │ REGION=eu    │     │ REGION=eu    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────┐
│          Same Docker Image (ghcr.io/app:v1.2.3)     │
└─────────────────────────────────────────────────────┘
```

### .env.example (committed to repo)

```bash
# ── Application ────────────────────────
NODE_ENV=development
PORT=3000
APP_VERSION=0.0.0

# ── Neo4j ──────────────────────────────
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=

# ── Couchbase ──────────────────────────
COUCHBASE_URL=couchbase://localhost
COUCHBASE_BUCKET=cost-analyzer
COUCHBASE_USERNAME=
COUCHBASE_PASSWORD=

# ── AWS ────────────────────────────────
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# ── Bedrock AI ─────────────────────────
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_BEDROCK_REGION=eu-central-1

# ── LangSmith Observability ───────────
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=cost-analyzer-dev
LANGSMITH_TRACING_V2=true

# ── Frontend (compile-time) ───────────
PUBLIC_API_URL=http://localhost:3000
PUBLIC_APP_ENV=development
```

### Environment-Specific Model Selection

A key pattern from the cost analyzer — different models per environment:

```bash
# .env.dev — cheap, fast
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0

# .env.stg — test with production model
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# .env.prd — proven, stable
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## 10. GitHub Actions — CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  BUN_VERSION: "1.1"

jobs:
  # ── Lint & Type Check ──────────────────
  lint:
    name: Lint & Types
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run typecheck

      - name: Lint
        run: bun run lint

  # ── Unit Tests ─────────────────────────
  test:
    name: Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun test
        env:
          NODE_ENV: test

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  # ── Build Check ────────────────────────
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build API
        run: bun run build
        working-directory: packages/api

      - name: Build Frontend
        run: bun run build
        working-directory: packages/frontend
        env:
          PUBLIC_API_URL: https://api.example.com
```

---

## 11. GitHub Actions — Docker Build & Push

```yaml
# .github/workflows/docker-build.yml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  API_IMAGE: ${{ github.repository }}-api
  FRONTEND_IMAGE: ${{ github.repository }}-frontend

permissions:
  contents: read
  packages: write

jobs:
  # ── Build & Push API Image ─────────────
  build-api:
    name: Build API Image
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.API_IMAGE }}
          tags: |
            # Branch name
            type=ref,event=branch
            # PR number
            type=ref,event=pr
            # Semver tag
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            # SHA (always)
            type=sha,prefix=sha-
            # Latest on main
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./packages/api
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            APP_VERSION=${{ steps.meta.outputs.version }}

  # ── Build & Push Frontend Image ────────
  build-frontend:
    name: Build Frontend Image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.FRONTEND_IMAGE }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./packages/frontend
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            PUBLIC_API_URL=${{ vars.PUBLIC_API_URL }}
            PUBLIC_APP_ENV=production

  # ── Security Scan ──────────────────────
  scan:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: [build-api, build-frontend]
    if: github.event_name != 'pull_request'
    steps:
      - name: Run Trivy (API)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.API_IMAGE }}:latest
          format: "sarif"
          output: "trivy-api.sarif"
          severity: "CRITICAL,HIGH"

      - name: Upload scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: "trivy-api.sarif"
```

---

## 12. GitHub Actions — Scheduled Jobs

These are patterns from the cost analyzer for automated maintenance:

```yaml
# .github/workflows/scheduled.yml
name: Scheduled Jobs

on:
  schedule:
    # Daily cost sync at 2 AM UTC
    - cron: "0 2 * * *"
  workflow_dispatch:
    inputs:
      job:
        description: "Which job to run"
        required: true
        type: choice
        options:
          - sync-costs
          - check-bedrock
          - health-check

jobs:
  # ── Daily Cost Sync ────────────────────
  sync-costs:
    name: Sync AWS Costs
    runs-on: ubuntu-latest
    if: >
      github.event.schedule == '0 2 * * *' ||
      github.event.inputs.job == 'sync-costs'
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run cost sync
        run: bun run scripts/sync-costs.ts
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: eu-central-1
          NEO4J_URI: ${{ secrets.NEO4J_URI }}
          NEO4J_PASSWORD: ${{ secrets.NEO4J_PASSWORD }}
          COUCHBASE_URL: ${{ secrets.COUCHBASE_URL }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "⚠️ Cost sync failed! Check: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

  # ── Weekly Bedrock Model Check ─────────
  check-bedrock:
    name: Check Bedrock Models
    runs-on: ubuntu-latest
    if: >
      github.event.schedule == '0 0 * * 0' ||
      github.event.inputs.job == 'check-bedrock'
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Check model availability
        run: bun run scripts/check-bedrock-models.ts
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: eu-central-1
          AWS_BEDROCK_MODEL_ID: ${{ vars.AWS_BEDROCK_MODEL_ID }}
```

### Weekly Bedrock Check Workflow (Standalone)

```yaml
# .github/workflows/bedrock-check.yml
name: Check Bedrock Models

on:
  schedule:
    - cron: "0 0 * * 0"  # Weekly on Sunday
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install --frozen-lockfile
      - run: bun run scripts/check-bedrock-models.ts
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: eu-central-1
```

---

## 13. GitHub Actions — Environment Deployments

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        options:
          - staging
          - production

env:
  REGISTRY: ghcr.io

jobs:
  # ── Deploy to Staging ──────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    if: >
      github.event.inputs.environment == 'staging' ||
      startsWith(github.ref, 'refs/tags/v')
    environment:
      name: staging
      url: https://staging.your-app.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          echo "Deploying ${{ github.sha }} to staging..."
          # SSH deploy, kubectl, ECS update, etc.
        env:
          DEPLOY_KEY: ${{ secrets.STAGING_DEPLOY_KEY }}
          IMAGE_TAG: sha-${{ github.sha }}

      - name: Verify deployment
        run: |
          # Wait for health check
          for i in {1..30}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://staging.your-app.com/health)
            if [ "$STATUS" = "200" ]; then
              echo "✅ Staging is healthy"
              exit 0
            fi
            echo "Waiting... ($i/30)"
            sleep 10
          done
          echo "❌ Health check failed"
          exit 1

  # ── Deploy to Production ───────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging
    if: >
      github.event.inputs.environment == 'production' ||
      startsWith(github.ref, 'refs/tags/v')
    environment:
      name: production
      url: https://your-app.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          echo "Deploying ${{ github.sha }} to production..."
        env:
          DEPLOY_KEY: ${{ secrets.PROD_DEPLOY_KEY }}
          IMAGE_TAG: sha-${{ github.sha }}

      - name: Verify deployment
        run: |
          for i in {1..30}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://your-app.com/health)
            if [ "$STATUS" = "200" ]; then
              echo "✅ Production is healthy"
              exit 0
            fi
            sleep 10
          done
          exit 1

      - name: Notify success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚀 Production deployed: ${{ github.ref_name }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 14. GitHub Actions — Reusable Workflows

### Reusable Docker Build

```yaml
# .github/workflows/reusable-docker-build.yml
name: Reusable Docker Build

on:
  workflow_call:
    inputs:
      context:
        required: true
        type: string
      image-name:
        required: true
        type: string
      build-args:
        required: false
        type: string
        default: ""
    outputs:
      image-tag:
        description: "The built image tag"
        value: ${{ jobs.build.outputs.tag }}

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ inputs.image-name }}
          tags: |
            type=semver,pattern={{version}}
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}

      - uses: docker/build-push-action@v6
        with:
          context: ${{ inputs.context }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: ${{ inputs.build-args }}
```

### Calling the Reusable Workflow

```yaml
# .github/workflows/build-all.yml
name: Build All Images

on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  build-api:
    uses: ./.github/workflows/reusable-docker-build.yml
    with:
      context: ./packages/api
      image-name: ${{ github.repository }}-api

  build-frontend:
    uses: ./.github/workflows/reusable-docker-build.yml
    with:
      context: ./packages/frontend
      image-name: ${{ github.repository }}-frontend
      build-args: |
        PUBLIC_API_URL=https://api.your-app.com
```

---

## 15. Secret Management

### GitHub Secrets Setup

```
Repository Settings → Secrets and Variables → Actions

├── Secrets (sensitive values)
│   ├── AWS_ACCESS_KEY_ID
│   ├── AWS_SECRET_ACCESS_KEY
│   ├── NEO4J_PASSWORD
│   ├── NEO4J_URI
│   ├── COUCHBASE_URL
│   ├── COUCHBASE_PASSWORD
│   ├── LANGSMITH_API_KEY
│   ├── SLACK_WEBHOOK
│   ├── STAGING_DEPLOY_KEY
│   └── PROD_DEPLOY_KEY
│
├── Variables (non-sensitive config)
│   ├── AWS_REGION=eu-central-1
│   ├── AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
│   ├── LANGSMITH_PROJECT=cost-analyzer
│   └── PUBLIC_API_URL=https://api.your-app.com
│
└── Environments
    ├── staging
    │   ├── Secrets: DEPLOY_KEY, DB_PASSWORD
    │   └── Variables: API_URL, MODEL_ID
    └── production
        ├── Secrets: DEPLOY_KEY, DB_PASSWORD
        ├── Variables: API_URL, MODEL_ID
        └── Protection rules: Required reviewers
```

### Environment Protection Rules

For production deployments, configure:
- Required reviewers (at least 1 approval)
- Wait timer (optional, e.g., 5 minutes)
- Deployment branches (only `main` and `v*` tags)

---

## 16. Security Best Practices

### Docker Security

```dockerfile
# 1. Always use specific tags, never :latest in FROM
FROM oven/bun:1.1.38-slim    # ✅ Pinned
FROM oven/bun:latest          # ❌ Unpredictable

# 2. Non-root user
RUN adduser --system --uid 1001 appuser
USER appuser

# 3. Read-only filesystem (in compose)
# docker-compose.yml:
#   read_only: true
#   tmpfs:
#     - /tmp

# 4. No new privileges
# docker-compose.yml:
#   security_opt:
#     - no-new-privileges:true

# 5. Drop all capabilities
# docker-compose.yml:
#   cap_drop:
#     - ALL
```

### GitHub Actions Security

```yaml
# 1. Pin action versions to SHA (not tags)
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

# 2. Minimal permissions per job
permissions:
  contents: read
  packages: write

# 3. Never echo secrets
- run: echo "${{ secrets.API_KEY }}"     # ❌ Exposed in logs
- run: some-command                       # ✅ Use env vars
  env:
    API_KEY: ${{ secrets.API_KEY }}

# 4. Dependabot for action updates
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directory: "/packages/api"
    schedule:
      interval: "weekly"

  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Image Scanning

```yaml
# Add to any build workflow
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ steps.meta.outputs.version }}
    format: "table"
    exit-code: "1"              # Fail build on critical vulns
    severity: "CRITICAL,HIGH"
    ignore-unfixed: true
```

---

## 17. Checklist for New Projects

### Initial Setup

- [ ] Create `.dockerignore` (copy from Section 4)
- [ ] Create `Dockerfile` for backend (Section 2)
- [ ] Create `Dockerfile` for frontend (Section 3)
- [ ] Create `docker-compose.dev.yml` (Section 5)
- [ ] Create `docker-compose.prod.yml` (Section 6)
- [ ] Create `.env.example` with all env vars documented (Section 9)
- [ ] Add `/health` endpoint to API (Section 8)
- [ ] Add `nginx.conf` for frontend (Section 3)

### GitHub Actions Setup

- [ ] Create `.github/workflows/ci.yml` — lint, test, build (Section 10)
- [ ] Create `.github/workflows/docker-build.yml` — build & push (Section 11)
- [ ] Create `.github/workflows/deploy.yml` — environment deploys (Section 13)
- [ ] Create `.github/dependabot.yml` (Section 16)
- [ ] Configure repository secrets and variables (Section 15)
- [ ] Configure environment protection rules for production
- [ ] Enable GHCR (GitHub Container Registry) for the repository

### Scheduled Jobs (If Applicable)

- [ ] Create `.github/workflows/scheduled.yml` for cron jobs (Section 12)
- [ ] Create `scripts/` directory with automation scripts
- [ ] Add Slack/Teams notifications for failures

### Security

- [ ] Dockerfiles use non-root user
- [ ] No secrets baked into images
- [ ] Trivy scan in CI pipeline
- [ ] GitHub Actions permissions set to minimum
- [ ] Dependabot enabled for all ecosystems

---

## Quick Reference: Key Files to Create

```
your-project/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml                    # Lint + Test + Build
│       ├── docker-build.yml          # Build & push images
│       ├── deploy.yml                # Deploy to environments
│       └── scheduled.yml             # Cron jobs (cost sync, model check)
├── packages/
│   ├── api/
│   │   ├── Dockerfile                # Multi-stage production
│   │   ├── Dockerfile.dev            # Hot-reload development
│   │   └── src/
│   │       └── routes/health.ts      # Health check endpoint
│   └── frontend/
│       ├── Dockerfile                # Multi-stage with nginx
│       └── nginx.conf                # SPA routing + API proxy
├── .dockerignore
├── .env.example
├── docker-compose.dev.yml
├── docker-compose.prod.yml
└── docker-compose.yml                # Full stack
```

---

## Environment Variable Quick Reference

| Variable | Dev | Staging | Production |
|----------|-----|---------|------------|
| `NODE_ENV` | development | staging | production |
| `AWS_BEDROCK_MODEL_ID` | claude-3-haiku | claude-3-5-sonnet | claude-3-5-sonnet |
| `LANGSMITH_PROJECT` | app-dev | app-stg | app-prd |
| `PUBLIC_API_URL` | localhost:3000 | staging.app.com | api.app.com |
| `LOG_LEVEL` | debug | info | warn |
