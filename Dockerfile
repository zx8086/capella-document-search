# syntax=docker/dockerfile:1.4

# Base stage
FROM oven/bun:canary-alpine AS builder

# Set build arguments
ARG BUILD_VERSION=development
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ARG NODE_ENV=production

# Set environment variables
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV NODE_ENV=${NODE_ENV}
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV LC_CTYPE=C.UTF-8

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy all files and build the application
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun run svelte-kit sync && \
    bun run build:no-telemetry

# Production image
FROM oven/bun:canary-alpine

# Copy build args to production stage
ARG BUILD_VERSION
ARG COMMIT_HASH
ARG BUILD_DATE
ARG NODE_ENV

# Set environment variables for runtime
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV NODE_ENV=${NODE_ENV}
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV LC_CTYPE=C.UTF-8

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/ ./

# Install production dependencies
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile && \
    chown -R bun:bun /app

USER bun
EXPOSE 3000

CMD ["bun", "run", "--preload", "./src/instrumentation.ts", "./build/index.js"]