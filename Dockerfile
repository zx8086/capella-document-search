#Dockerfile

# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

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
    echo "Starting application..."\n\
    exec bun --preload /app/set-global.js ./build/index.js' > /app/start.sh && chmod +x /app/start.sh

# Expose the port the app runs on
EXPOSE 3000

# Set the working directory
WORKDIR /app

# Run the application
CMD ["/app/start.sh"]
