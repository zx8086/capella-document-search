# Dockerfile

FROM oven/bun:latest AS base

WORKDIR /app

# Define build arguments and set environment variables with default empty values
ARG ENABLE_FILE_LOGGING=""
ARG LOG_LEVEL=""
ARG LOG_MAX_SIZE=""
ARG LOG_MAX_FILES=""
ARG GRAPHQL_ENDPOINT=""
ARG DB_DATA_DIR=""
ARG PUBLIC_CSV_FILE_UPLOAD_LIMIT=""
ARG API_BASE_URL=""
ARG ENABLE_OPENTELEMETRY=""
ARG SERVICE_NAME=""
ARG SERVICE_VERSION=""
ARG DEPLOYMENT_ENVIRONMENT=""
ARG TRACES_ENDPOINT=""
ARG METRICS_ENDPOINT=""
ARG LOGS_ENDPOINT=""
ARG METRIC_READER_INTERVAL=""
ARG CONSOLE_METRIC_READER_INTERVAL=""
ARG SUMMARY_LOG_INTERVAL=""
ARG PUBLIC_OPENREPLAY_INGEST_POINT=""
ARG PUBLIC_ELASTIC_APM_SERVICE_NAME=""
ARG PUBLIC_ELASTIC_APM_SERVER_URL=""
ARG PUBLIC_ELASTIC_APM_SERVICE_VERSION=""
ARG PUBLIC_ELASTIC_APM_ENVIRONMENT=""

ENV ENABLE_FILE_LOGGING=${ENABLE_FILE_LOGGING}
ENV LOG_LEVEL=${LOG_LEVEL}
ENV LOG_MAX_SIZE=${LOG_MAX_SIZE}
ENV LOG_MAX_FILES=${LOG_MAX_FILES}
ENV GRAPHQL_ENDPOINT=${GRAPHQL_ENDPOINT}
ENV DB_DATA_DIR=${DB_DATA_DIR}
ENV PUBLIC_CSV_FILE_UPLOAD_LIMIT=${PUBLIC_CSV_FILE_UPLOAD_LIMIT}
ENV API_BASE_URL=${API_BASE_URL}
ENV ENABLE_OPENTELEMETRY=${ENABLE_OPENTELEMETRY}
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_VERSION=${SERVICE_VERSION}
ENV DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT}
ENV TRACES_ENDPOINT=${TRACES_ENDPOINT}
ENV METRICS_ENDPOINT=${METRICS_ENDPOINT}
ENV LOGS_ENDPOINT=${LOGS_ENDPOINT}
ENV METRIC_READER_INTERVAL=${METRIC_READER_INTERVAL}
ENV CONSOLE_METRIC_READER_INTERVAL=${CONSOLE_METRIC_READER_INTERVAL}
ENV SUMMARY_LOG_INTERVAL=${SUMMARY_LOG_INTERVAL}
ENV PUBLIC_OPENREPLAY_INGEST_POINT=${PUBLIC_OPENREPLAY_INGEST_POINT}
ENV PUBLIC_ELASTIC_APM_SERVICE_NAME=${PUBLIC_ELASTIC_APM_SERVICE_NAME}
ENV PUBLIC_ELASTIC_APM_SERVER_URL=${PUBLIC_ELASTIC_APM_SERVER_URL}
ENV PUBLIC_ELASTIC_APM_SERVICE_VERSION=${PUBLIC_ELASTIC_APM_SERVICE_VERSION}
ENV PUBLIC_ELASTIC_APM_ENVIRONMENT=${PUBLIC_ELASTIC_APM_ENVIRONMENT}

# Print environment variables for debugging
RUN env

# Dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Release
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app ./
COPY package.json bunfig.toml svelte.config.js vite.config.ts ./

# Before running the build command, print environment variables again
RUN env

# Run build
RUN bun run build

# Ensure the src/data directory exists
RUN mkdir -p /app/src/data && chown -R bun:bun /app/src/data

# Create a script to set global variables and start the application
RUN echo '#!/bin/sh\n\
    echo "ENABLE_OPENTELEMETRY is set to: $ENABLE_OPENTELEMETRY"\n\
    if [ "$ENABLE_OPENTELEMETRY" = "true" ]; then\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = true;" > /app/set-global.js\n\
    else\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = false;" > /app/set-global.js\n\
    fi\n\
    echo "Contents of set-global.js:"\n\
    cat /app/set-global.js\n\
    echo "Starting application..."\n\
    exec bun --preload /app/set-global.js ./build/index.js' > /app/start.sh && chmod +x /app/start.sh

USER bun
EXPOSE 3000

CMD ["/app/start.sh"]
