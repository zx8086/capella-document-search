# syntax=docker/dockerfile:1

# Stage 1: deps-base -- Alpine with system dependencies
FROM oven/bun:1.3.11-alpine AS deps-base
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
    --mount=type=cache,target=/var/lib/apk,sharing=locked \
    apk update && \
    apk upgrade && \
    apk add ca-certificates

# Stage 2: deps-prod -- Production dependencies only
FROM deps-base AS deps-prod
COPY package.json ./
COPY bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    --mount=type=cache,target=/root/.cache/bun,sharing=locked \
    bun install --frozen-lockfile --production

# Stage 3: builder -- Full install and build
FROM deps-base AS builder
COPY package.json ./
COPY bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    --mount=type=cache,target=/root/.cache/bun,sharing=locked \
    bun install --frozen-lockfile

COPY . .

RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    --mount=type=cache,target=/root/.cache/bun,sharing=locked \
    --mount=type=cache,target=/tmp/bun-build,sharing=locked \
    cp bunfig.build.toml bunfig.toml && \
    bun run svelte-kit sync && \
    bun run build:no-telemetry && \
    rm -rf .git .github node_modules/.cache test/ tests/ \
           *.test.* *.spec.* *.md docs/ coverage/ \
           .vscode .idea *.log && \
    mkdir -p build

# Stage 4: production -- Alpine Bun runtime
FROM oven/bun:1.3.11-alpine AS production
WORKDIR /app

RUN addgroup -g 65532 -S nonroot && \
    adduser -u 65532 -S -G nonroot -h /app nonroot

COPY --from=deps-prod --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=deps-prod --chown=65532:65532 /app/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/build ./build

ARG BUILD_VERSION=development
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ARG NODE_ENV=production

ENV BUILD_VERSION=${BUILD_VERSION} \
    COMMIT_HASH=${COMMIT_HASH} \
    BUILD_DATE=${BUILD_DATE} \
    NODE_ENV=${NODE_ENV} \
    PORT=3000 \
    HOST=0.0.0.0

USER 65532:65532
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 \
    CMD ["/usr/local/bin/bun", "--eval", \
    "fetch(\"http://localhost:3000/api/health-check\").then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/bun", "build/index.js"]

ARG VCS_REF
ARG SERVICE_NAME
ARG SERVICE_VERSION
ARG SERVICE_DESCRIPTION
ARG SERVICE_AUTHOR
ARG SERVICE_LICENSE

LABEL org.opencontainers.image.title="${SERVICE_NAME}" \
    org.opencontainers.image.description="${SERVICE_DESCRIPTION}" \
    org.opencontainers.image.vendor="${SERVICE_AUTHOR}" \
    org.opencontainers.image.version="${SERVICE_VERSION}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.licenses="${SERVICE_LICENSE}" \
    org.opencontainers.image.base.name="oven/bun:1.3.11-alpine"
