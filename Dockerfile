# syntax=docker/dockerfile:1.4

# Base stage
FROM oven/bun:canary-alpine AS builder

# Set build arguments first since they rarely change
ARG BUILD_VERSION=development
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ARG NODE_ENV=development

# Set as environment variables for build process
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV NODE_ENV=${NODE_ENV}
ENV VITE_DISABLE_OPENREPLAY=true

WORKDIR /app

# Copy package files first for better cache utilization
COPY package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Patch problematic packages
RUN mkdir -p /app/patches && \
    # Create patch files for problematic imports
    echo 'const sdp = require("sdp/sdp.js"); module.exports = sdp;' > /app/patches/sdp-fix.js && \
    echo 'const zenObservable = require("zen-observable"); module.exports = zenObservable;' > /app/patches/zen-observable-fix.js && \
    # Apply patches
    find /app/node_modules -name "common_shim.js" -exec sed -i 's/import SDPUtils from .sdp.;/import SDPUtils from "..\/..\/..\/patches\/sdp-fix.js";/' {} \; && \
    find /app/node_modules -name "apolloMiddleware.js" -exec sed -i 's/import Observable from .zen-observable.;/import Observable from "..\/..\/..\/patches\/zen-observable-fix.js";/' {} \;

# Copy all files after dependency installation
COPY . .

# Build the application
COPY bunfig.build.toml bunfig.toml
RUN NODE_ENV=${NODE_ENV} \
    bun run svelte-kit sync && \
    bun run build:no-telemetry

# Production image
FROM oven/bun:canary-alpine

# Copy build args to production stage
ARG BUILD_VERSION
ARG COMMIT_HASH
ARG BUILD_DATE
ARG NODE_ENV

# Set as environment variables for runtime
ENV BUILD_VERSION=${BUILD_VERSION}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV BUILD_DATE=${BUILD_DATE}
ENV NODE_ENV=${NODE_ENV}

# These two lines enable debugging in production
ENV NODE_DEBUG=http
ENV BUN_CONFIG_VERBOSE_FETCH=true

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/ ./

# Install production dependencies with cache
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --frozen-lockfile && \
    mkdir -p src/data && \
    chown -R bun:bun /app

USER bun
EXPOSE 3000

CMD ["bun", "run", "--preload", "./src/instrumentation.ts", "./build/index.js"]