# Dockerfile

# Use the official Bun image
# Note: As of the last check, this image contains a known vulnerability:
# Critical severity vulnerability found in zlib/zlib1g
# Description: Integer Overflow or Wraparound
# Info: https://security.snyk.io/vuln/SNYK-DEBIAN11-ZLIB-6008961
# This vulnerability is present in the base image and cannot be immediately resolved.
# Use the official Bun image
FROM oven/bun:slim AS base

# Set common environment variables
ENV APP_ROOT=/usr/src/app
WORKDIR ${APP_ROOT}

# Create necessary directories
RUN mkdir -p ${APP_ROOT}/logs

# Install dependencies stage
FROM base AS deps

# Copy configuration files
COPY package.json bun.lockb ./
COPY svelte.config.js vite.config.ts tsconfig.json ./

# Install dependencies
RUN --mount=type=cache,target=/root/.bun \
    bun install

# Build stage
FROM deps AS builder

# Set environment variables for build
ENV NODE_ENV=production
ENV DISABLE_OPENTELEMETRY=true
ENV ENABLE_FILE_LOGGING=false
ENV LOG_LEVEL=info
ENV LOG_MAX_SIZE=20m
ENV LOG_MAX_FILES=14d
ENV GRAPHQL_ENDPOINT=http://localhost:4000/graphql
ENV DB_DATA_DIR=src/data
ENV API_BASE_URL=https://cloudapi.cloud.couchbase.com/v4
ENV ORG_ID=your-org-id
ENV PROJECT_ID=your-project-id
ENV CLUSTER_ID=your-cluster-id
ENV BUCKET_ID=your-bucket-id
ENV AUTH_TOKEN=your-auth-token
ENV SERVICE_NAME="Capella Document Search"
ENV SERVICE_VERSION=2.0.0
ENV DEPLOYMENT_ENVIRONMENT=production
ENV TRACES_ENDPOINT=https://your-traces-endpoint
ENV METRICS_ENDPOINT=https://your-metrics-endpoint
ENV LOGS_ENDPOINT=https://your-logs-endpoint
ENV METRIC_READER_INTERVAL=60000
ENV SUMMARY_LOG_INTERVAL=300000
ENV PUBLIC_OPENREPLAY_INGEST_POINT=https://your-openreplay-ingest-point
ENV PUBLIC_ELASTIC_APM_SERVICE_NAME="Capella Document Search"
ENV PUBLIC_ELASTIC_APM_SERVER_URL=2.0.0
ENV PUBLIC_ELASTIC_APM_SERVICE_VERSION=https://your-apm-server-url
ENV PUBLIC_ELASTIC_APM_ENVIRONMENT=production

# Copy source files and configuration
COPY src ${APP_ROOT}/src
COPY svelte.config.js vite.config.ts tsconfig.json ./

# Build the application
RUN echo "Starting build process..." && \
    bun run build

# Final release stage
FROM deps AS release

# Set Node environment
ENV NODE_ENV=production

# Copy built files from builder stage
COPY --from=builder ${APP_ROOT}/build ${APP_ROOT}/build

# Copy static directory if it exists, otherwise create an empty one
RUN if [ -d "${APP_ROOT}/static" ]; then \
    cp -R ${APP_ROOT}/static ${APP_ROOT}/static_temp && \
    rm -rf ${APP_ROOT}/static && \
    mv ${APP_ROOT}/static_temp ${APP_ROOT}/static; \
    else \
    mkdir -p ${APP_ROOT}/static; \
    fi

# Copy source files and configuration for runtime
COPY src ${APP_ROOT}/src
COPY svelte.config.js vite.config.ts tsconfig.json ./


# Set default values for environment variables
ENV ENABLE_FILE_LOGGING=false \
    LOG_LEVEL=log \
    LOG_MAX_SIZE=20m \
    LOG_MAX_FILES=14d \
    GRAPHQL_ENDPOINT=http://localhost:4000/graphql \
    DB_DATA_DIR=src/data \
    PUBLIC_CSV_FILE_UPLOAD_LIMIT=50 \
    PUBLIC_VIDEO_BASE_URL="" \
    API_BASE_URL=https://example-api-url.com/v4 \
    ORG_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee \
    PROJECT_ID=ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj \
    CLUSTER_ID=kkkkkkkk-llll-mmmm-nnnn-oooooooooooo \
    BUCKET_ID=XXXXXXXXXXXX== \
    AUTH_TOKEN=your-auth-token \
    ENABLE_OPENTELEMETRY=false \
    SERVICE_NAME="Capella Document Search" \
    SERVICE_VERSION=2.0.0 \
    DEPLOYMENT_ENVIRONMENT=production \
    TRACES_ENDPOINT=https://your-traces-endpoint \
    METRICS_ENDPOINT=https://your-metrics-endpoint \
    LOGS_ENDPOINT=https://your-logs-endpoint \
    METRIC_READER_INTERVAL=60000 \
    CONSOLE_METRIC_READER_INTERVAL=60000 \
    SUMMARY_LOG_INTERVAL=300000 \
    PUBLIC_OPENREPLAY_INGEST_POINT=https://your-openreplay-ingest-point \
    PUBLIC_ELASTIC_APM_SERVICE_NAME="Capella Document Search" \
    PUBLIC_ELASTIC_APM_SERVER_URL=https://your-apm-server-url \
    PUBLIC_ELASTIC_APM_SERVICE_VERSION=2.0.0 \
    PUBLIC_ELASTIC_APM_ENVIRONMENT=production

# Set ownership of app directory to bun user
RUN chown -R bun:bun ${APP_ROOT}

# Switch to non-root user
USER bun

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["bun", "run", "start"]
