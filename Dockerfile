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

# More explicit patching with debug output
RUN mkdir -p /app/patches && \
    # Create patch files for problematic imports
    echo 'const sdp = require("sdp/sdp.js"); module.exports = sdp;' > /app/patches/sdp-fix.js && \
    echo 'const zenObservable = require("zen-observable"); module.exports = zenObservable;' > /app/patches/zen-observable-fix.js && \
    # Debug - locate the files
    echo "Looking for files to patch..." && \
    find /app/node_modules -path "*webrtc-adapter*/*common_shim.js" && \
    find /app/node_modules -path "*openreplay/tracker-graphql*/*apolloMiddleware.js" && \
    # Direct patching with explicit paths
    if [ -f /app/node_modules/webrtc-adapter/src/js/common_shim.js ]; then \
      echo "Patching webrtc-adapter..." && \
      sed -i 's|import SDPUtils from .sdp.;|import SDPUtils from "../../../patches/sdp-fix.js";|' /app/node_modules/webrtc-adapter/src/js/common_shim.js && \
      cat /app/node_modules/webrtc-adapter/src/js/common_shim.js | grep -A 2 "import SDPUtils"; \
    fi && \
    if [ -f /app/node_modules/@openreplay/tracker-graphql/lib/apolloMiddleware.js ]; then \
      echo "Patching openreplay tracker-graphql..." && \
      sed -i 's|import Observable from .zen-observable.;|import Observable from "../../../patches/zen-observable-fix.js";|' /app/node_modules/@openreplay/tracker-graphql/lib/apolloMiddleware.js && \
      cat /app/node_modules/@openreplay/tracker-graphql/lib/apolloMiddleware.js | grep -A 2 "import Observable"; \
    fi

# Copy all files after dependency installation
COPY . .

# Create a temporary vite configuration to add resolver for zen-observable
RUN echo "import { defineConfig } from 'vite'; \
    import { sveltekit } from '@sveltejs/kit/vite'; \
    export default defineConfig({ \
      plugins: [ \
        sveltekit(), \
        { \
          name: 'zen-observable-resolver', \
          resolveId(id) { \
            if (id === 'zen-observable') { \
              return { id: '/app/patches/zen-observable-fix.js', external: false }; \
            } \
          } \
        } \
      ] \
    });" > /app/vite.config.js

# Create more direct patch for the zen-observable module
RUN echo "// Create direct patch for zen-observable" && \
    sed -i 's/module.exports = zenObservable;/module.exports = zenObservable; module.exports.default = zenObservable;/' /app/patches/zen-observable-fix.js && \
    cat /app/patches/zen-observable-fix.js

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