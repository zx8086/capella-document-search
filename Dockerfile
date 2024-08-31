#Dockerfile

# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app
ENV NODE_ENV=production

# Install dependencies into temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile
# Install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build the application
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bun run build

# Final stage
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /usr/src/app/build build
COPY --from=build /usr/src/app/src src
COPY --from=build /usr/src/app/package.json .
COPY --from=build /usr/src/app/bunfig.toml .
COPY --from=build /usr/src/app/svelte.config.js .
COPY --from=build /usr/src/app/vite.config.ts .

# Set up environment variables
ENV NODE_ENV=production
ENV ENABLE_OPENTELEMETRY=false

# Create a script to set global variables and start the application
RUN echo '#!/bin/sh\n\
    if [ "$ENABLE_OPENTELEMETRY" = "true" ]; then\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = true;" > /usr/src/app/set-global.js\n\
    else\n\
    echo "globalThis.INSTRUMENTATION_ENABLED = false;" > /usr/src/app/set-global.js\n\
    fi\n\
    exec bun --preload /usr/src/app/set-global.js ./build/index.js' > /usr/src/app/start.sh && chmod +x /usr/src/app/start.sh

# Expose the port the app runs on
EXPOSE 5173

# Run the application
CMD ["/usr/src/app/start.sh"]
