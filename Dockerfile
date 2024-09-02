#Dockerfile

# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_OPENREPLAY_PROJECT_KEY
ARG VITE_OPENREPLAY_INGEST_POINT
RUN bun run build

# Production image
FROM base AS release
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/src ./src
COPY package.json bunfig.toml svelte.config.js vite.config.ts ./

# Set up environment variables
ENV NODE_ENV=production
ENV ENABLE_OPENTELEMETRY=false
ENV PORT=3000

# Create a script to set global variables and start the application
RUN echo '#!/bin/sh\n\
    if [ "$ENABLE_OPENTELEMETRY" = "true" ]; then\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = true;" > /app/set-global.js\n\
    else\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = false;" > /app/set-global.js\n\
    fi\n\
    exec bun --preload /app/set-global.js ./build/index.js' > /app/start.sh && chmod +x /app/start.sh

# Expose the port the app runs on
EXPOSE $PORT

# Run the application
CMD ["/app/start.sh"]
