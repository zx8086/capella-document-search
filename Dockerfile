#Dockerfile

# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Add build arguments
ARG ENABLE_FILE_LOGGING
ARG LOG_LEVEL
ARG LOG_MAX_SIZE
ARG LOG_MAX_FILES
ARG GRAPHQL_ENDPOINT
ARG DB_DATA_DIR
ARG VITE_FILE_UPLOAD_LIMIT
ARG API_BASE_URL
ARG ORG_ID
ARG PROJECT_ID
ARG CLUSTER_ID
ARG BUCKET_ID
ARG AUTH_TOKEN
ARG ENABLE_OPENTELEMETRY
ARG SERVICE_NAME
ARG SERVICE_VERSION
ARG DEPLOYMENT_ENVIRONMENT
ARG TRACES_ENDPOINT
ARG METRICS_ENDPOINT
ARG LOGS_ENDPOINT
ARG METRIC_READER_INTERVAL
ARG CONSOLE_METRIC_READER_INTERVAL
ARG VITE_OPENREPLAY_PROJECT_KEY
ARG VITE_OPENREPLAY_INGEST_POINT
ARG VITE_ELASTIC_APM_SERVICE_NAME
ARG VITE_ELASTIC_APM_SERVER_URL
ARG VITE_ELASTIC_APM_SERVICE_VERSION
ARG VITE_ELASTIC_APM_ENVIRONMENT
ARG VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS

# Set environment variables
ENV ENABLE_FILE_LOGGING=${ENABLE_FILE_LOGGING}
ENV LOG_LEVEL=${LOG_LEVEL}
ENV LOG_MAX_SIZE=${LOG_MAX_SIZE}
ENV LOG_MAX_FILES=${LOG_MAX_FILES}
ENV GRAPHQL_ENDPOINT=${GRAPHQL_ENDPOINT}
ENV DB_DATA_DIR=${DB_DATA_DIR}
ENV VITE_FILE_UPLOAD_LIMIT=${VITE_FILE_UPLOAD_LIMIT}
ENV API_BASE_URL=${API_BASE_URL}
ENV ORG_ID=${ORG_ID}
ENV PROJECT_ID=${PROJECT_ID}
ENV CLUSTER_ID=${CLUSTER_ID}
ENV BUCKET_ID=${BUCKET_ID}
ENV AUTH_TOKEN=${AUTH_TOKEN}
ENV ENABLE_OPENTELEMETRY=${ENABLE_OPENTELEMETRY}
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_VERSION=${SERVICE_VERSION}
ENV DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT}
ENV TRACES_ENDPOINT=${TRACES_ENDPOINT}
ENV METRICS_ENDPOINT=${METRICS_ENDPOINT}
ENV LOGS_ENDPOINT=${LOGS_ENDPOINT}
ENV METRIC_READER_INTERVAL=${METRIC_READER_INTERVAL}
ENV CONSOLE_METRIC_READER_INTERVAL=${CONSOLE_METRIC_READER_INTERVAL}
ENV VITE_OPENREPLAY_PROJECT_KEY=${VITE_OPENREPLAY_PROJECT_KEY}
ENV VITE_OPENREPLAY_INGEST_POINT=${VITE_OPENREPLAY_INGEST_POINT}
ENV VITE_ELASTIC_APM_SERVICE_NAME=${VITE_ELASTIC_APM_SERVICE_NAME}
ENV VITE_ELASTIC_APM_SERVER_URL=${VITE_ELASTIC_APM_SERVER_URL}
ENV VITE_ELASTIC_APM_SERVICE_VERSION=${VITE_ELASTIC_APM_SERVICE_VERSION}
ENV VITE_ELASTIC_APM_ENVIRONMENT=${VITE_ELASTIC_APM_ENVIRONMENT}
ENV VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS=${VITE_ELASTIC_APM_DISTRIBUTED_TRACING_ORIGINS}

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production image
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/src ./src
COPY package.json bunfig.toml svelte.config.js vite.config.ts ./

# Add the secret mounting here
RUN --mount=type=secret,id=org_id \
    --mount=type=secret,id=project_id \
    --mount=type=secret,id=cluster_id \
    --mount=type=secret,id=bucket_id \
    --mount=type=secret,id=auth_token \
    --mount=type=secret,id=openreplay_key \
    echo "ORG_ID=$(cat /run/secrets/org_id)" >> /app/.env && \
    echo "PROJECT_ID=$(cat /run/secrets/project_id)" >> /app/.env && \
    echo "CLUSTER_ID=$(cat /run/secrets/cluster_id)" >> /app/.env && \
    echo "BUCKET_ID=$(cat /run/secrets/bucket_id)" >> /app/.env && \
    echo "AUTH_TOKEN=$(cat /run/secrets/auth_token)" >> /app/.env && \
    echo "VITE_OPENREPLAY_PROJECT_KEY=$(cat /run/secrets/openreplay_key)" >> /app/.env

# Copy Elastic APM RUM script and debug wrapper
COPY static/elastic-apm-rum.umd.js /app/build/client/elastic-apm-rum.umd.js
COPY static/elastic-apm-rum-debug-wrapper.js /app/elastic-apm-rum-debug-wrapper.js

# Combine debug wrapper with original script using a shell script
RUN echo '#!/bin/sh\n\
    cat /app/elastic-apm-rum-debug-wrapper.js > /app/build/client/elastic-apm-rum-debug.js\n\
    cat /app/build/client/elastic-apm-rum.umd.js >> /app/build/client/elastic-apm-rum-debug.js\n\
    echo "console.log(\"Debug: Elastic APM RUM script execution completed\");" >> /app/build/client/elastic-apm-rum-debug.js\n\
    echo "console.log(\"Debug: window.elasticApm is:\", window.elasticApm);" >> /app/build/client/elastic-apm-rum-debug.js\n\
    mv /app/build/client/elastic-apm-rum-debug.js /app/build/client/elastic-apm-rum.umd.js' > /app/combine_scripts.sh && \
    chmod +x /app/combine_scripts.sh && \
    /app/combine_scripts.sh

COPY static/apm-init.js /app/build/client/apm-init.js

# Copy the runtime configuration script
COPY /static/generate-runtime-config.sh /app/generate-runtime-config.sh
RUN chmod +x /app/generate-runtime-config.sh

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
    echo "HEALTH_CHECK_PORT is set to: $HEALTH_CHECK_PORT"\n\
    echo "Generating runtime config..."\n\
    /app/generate-runtime-config.sh\n\
    echo "Starting application..."\n\
    exec bun --preload /app/set-global.js ./build/index.js' > /app/start.sh && chmod +x /app/start.sh

# Expose the port the app runs on
EXPOSE 3000

# Set the working directory
WORKDIR /app

# Run the application
CMD ["/app/start.sh"]
