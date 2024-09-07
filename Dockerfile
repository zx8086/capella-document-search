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
