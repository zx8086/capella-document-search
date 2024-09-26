# Dockerfile

# Use the official Bun image
# Note: As of the last check, this image contains a known vulnerability:
# Critical severity vulnerability found in zlib/zlib1g
# Description: Integer Overflow or Wraparound
# Info: https://security.snyk.io/vuln/SNYK-DEBIAN11-ZLIB-6008961
# This vulnerability is present in the base image and cannot be immediately resolved.
# Use the official Bun image
FROM oven/bun:latest AS base

# Set common environment variables
ENV APP_ROOT=/usr/src/app
WORKDIR ${APP_ROOT}

# Create necessary directories
RUN mkdir -p ${APP_ROOT}/logs

# Install dependencies stage
FROM base AS deps

# Copy only package.json and lockfile
COPY package.json bun.lockb ./

# Install dependencies
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile

# Build stage
FROM deps AS builder

# Set environment variables for build
ENV NODE_ENV=production
ENV DISABLE_OPENTELEMETRY=true

# Copy all source files
COPY . .

# Build the application
RUN echo "Starting build process..." && \
    bun run build:docker

# Development stage
FROM deps AS development
ENV NODE_ENV=development
COPY . .
CMD ["bun", "run", "dev"]

# Final release stage
FROM deps AS release

# Set Node environment
ENV NODE_ENV=production

# Copy built files from builder stage
COPY --from=builder ${APP_ROOT}/build ${APP_ROOT}/build
COPY --from=builder ${APP_ROOT}/static ${APP_ROOT}/static

# Set default values for environment variables
ENV ENABLE_FILE_LOGGING=true \
    LOG_LEVEL=log \
    LOG_MAX_SIZE=20m \
    LOG_MAX_FILES=14d \
    GRAPHQL_ENDPOINT=http://localhost:4000/graphql \
    DB_DATA_DIR=src/data \
    PUBLIC_CSV_FILE_UPLOAD_LIMIT=50 \
    PUBLIC_VIDEO_BASE_URL="" \
    API_BASE_URL=https://cloudapi.cloud.couchbase.com/v4 \
    ORG_ID=9d75c6a4-2ec3-4a6c-8574-b3842eeaa4b5 \
    PROJECT_ID=1c249d82-f799-4b08-a8c0-18f7088e5049 \
    CLUSTER_ID=2091944c-177f-450e-9266-9761679ebc73 \
    BUCKET_ID=ZGVmYXVsdA== \
    ENABLE_OPENTELEMETRY=true \
    SERVICE_NAME="Capella Document Search" \
    SERVICE_VERSION=2.0.0 \
    DEPLOYMENT_ENVIRONMENT=production \
    TRACES_ENDPOINT=https://otel-http-traces.siobytes.com \
    METRICS_ENDPOINT=https://otel-http-metrics.siobytes.com \
    LOGS_ENDPOINT=https://otel-http-logs.siobytes.com \
    METRIC_READER_INTERVAL=60000 \
    CONSOLE_METRIC_READER_INTERVAL=60000 \
    SUMMARY_LOG_INTERVAL=300000 \
    PUBLIC_OPENREPLAY_INGEST_POINT=https://openreplay.prd.shared-services.eu.pvh.cloud/ingest \
    PUBLIC_ELASTIC_APM_SERVICE_NAME="Capella Document Search" \
    PUBLIC_ELASTIC_APM_SERVER_URL=https://apm.siobytes.com \
    PUBLIC_ELASTIC_APM_SERVICE_VERSION=2.0.0 \
    PUBLIC_ELASTIC_APM_ENVIRONMENT=production

# Create a script to set ENABLE_OPENTELEMETRY global variable and start the application
RUN echo '#!/bin/sh\n\
    if [ "$ENABLE_OPENTELEMETRY" = "true" ]; then\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = true;" > ${APP_ROOT}/set-global.js\n\
    else\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = false;" > ${APP_ROOT}/set-global.js\n\
    fi\n\
    exec bun --preload ${APP_ROOT}/set-global.js ${APP_ROOT}/build/index.js\n\
    ' > ${APP_ROOT}/start.sh && chmod +x ${APP_ROOT}/start.sh

# Set ownership of app directory to bun user
RUN chown -R bun:bun ${APP_ROOT}

# Switch to non-root user
USER bun

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["bun", "run", "start"]
