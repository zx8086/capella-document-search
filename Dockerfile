# Dockerfile

# Use the official Bun image
# Note: As of the last check, this image contains a known vulnerability:
# Critical severity vulnerability found in zlib/zlib1g
# Description: Integer Overflow or Wraparound
# Info: https://security.snyk.io/vuln/SNYK-DEBIAN11-ZLIB-6008961
# This vulnerability is present in the base image and cannot be immediately resolved.
FROM oven/bun:slim AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy all files
COPY . .

# Copy appropriate .env file based on build arg
ARG ENV_FILE=.env.development
ARG NODE_ENV=development
COPY ${ENV_FILE} .env

# Build the application
RUN bun run svelte-kit sync && \
    NODE_ENV=${NODE_ENV} \
    DISABLE_OPENTELEMETRY=true \
    bun run build

# Production image
FROM oven/bun:slim

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/ ./

# Install production dependencies
RUN bun install --production --frozen-lockfile && \
    mkdir -p src/data && \
    chown -R bun:bun /app

USER bun
EXPOSE 3000

# Make sure to get NODE_ENV from build arg
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

CMD ["bun", "run", "--preload", "./src/instrumentation.ts", "./build/index.js"]
