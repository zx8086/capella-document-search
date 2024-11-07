# Dockerfile

# Use the official Bun image
# Note: As of the last check, this image contains a known vulnerability:
# Critical severity vulnerability found in zlib/zlib1g
# Description: Integer Overflow or Wraparound
# Info: https://security.snyk.io/vuln/SNYK-DEBIAN11-ZLIB-6008961
# This vulnerability is present in the base image and cannot be immediately resolved.
FROM oven/bun:slim AS builder

# Add build args with defaults
ARG BUILD_VERSION=development
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ARG NODE_ENV=development

# Set as environment variables for build process
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV NODE_ENV=${NODE_ENV}

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy all files
COPY . .

# Build the application
RUN bun run svelte-kit sync && \
    NODE_ENV=${NODE_ENV} \
    DISABLE_OPENTELEMETRY=true \
    bun run build

# Production image
FROM oven/bun:slim

# Copy build args to production stage
ARG BUILD_VERSION
ARG COMMIT_HASH
ARG BUILD_DATE
ARG NODE_ENV

# Set as environment variables for runtime
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/ ./

# Install production dependencies
RUN bun install --production --frozen-lockfile && \
    mkdir -p src/data && \
    chown -R bun:bun /app

USER bun
EXPOSE 3000

CMD ["bun", "run", "--preload", "./src/instrumentation.ts", "./build/index.js"]
