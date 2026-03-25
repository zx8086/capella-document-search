# Docker Security Hardening Phase 2

## Goal

Rewrite the Dockerfile to align with the Docker Factory `bun-ssr` pattern (Scenario 3) so that:
1. The manual Dockerfile produces the same result the factory will generate
2. Migration to the automated Docker Factory is seamless
3. Local docker scripts use `package.json` as the version source of truth

## Docker Factory Alignment

This project will use the Docker Factory `bun-ssr` language config:
- **Builder image**: `oven/bun:1.3.11-alpine`
- **Runtime image**: `oven/bun:1.3.11-alpine` (not distroless)
- **No dumb-init, no musl copies, no binary copies** -- Alpine has everything
- **Artifact paths**: `build` (SvelteKit adapter-bun output)
- **Build cmd**: `cp bunfig.build.toml bunfig.toml && bun run svelte-kit sync && bun run build:no-telemetry`
- **Entrypoint**: `build/index.js`

Future Docker Factory inputs (for reference):
```yaml
inputs:
  language: bun-ssr
  builder_image: "oven/bun:1.3.11-alpine"
  runtime_image: "oven/bun:1.3.11-alpine"
  entrypoint: "build/index.js"
  build_cmd: >
    cp bunfig.build.toml bunfig.toml &&
    bun run svelte-kit sync &&
    bun run build:no-telemetry
  dep_files: "package.json bun.lock bunfig.build.toml"
```

## Current State

- Dockerfile uses unpinned `oven/bun:canary-alpine`, 2 stages, no OCI labels, no health check
- No `scripts/docker-build.sh` or `scripts/docker-security-check.sh`
- Local docker scripts hardcode versions (`0.0.1`, `0.0.1-dev`, `2.1.0`)
- `NODE_DEBUG=http` and `BUN_CONFIG_VERBOSE_FETCH=true` baked into production image
- Production stage copies entire `/app/` from builder (bloated image)

## Deliverables

### 1. Dockerfile rewrite (bun-ssr pattern)

Syntax directive: `# syntax=docker/dockerfile:1`

**Stage 1: deps-base** -- `oven/bun:1.3.11-alpine`
- Install `ca-certificates` via apk with BuildKit cache mounts:
  ```dockerfile
  RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
      --mount=type=cache,target=/var/lib/apk,sharing=locked \
      apk update && \
      apk upgrade --no-cache && \
      apk add --no-cache ca-certificates && \
      rm -rf /var/cache/apk/*
  ```
- No dumb-init needed (Bun on Alpine handles signals natively)

**Stage 2: deps-prod** -- extends deps-base
- Copy `package.json`, `bun.lock*` (glob -- optional)
- Run `bun install --frozen-lockfile --production` with Bun install cache mounts:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
      --mount=type=cache,target=/root/.cache/bun,sharing=locked \
      bun install --frozen-lockfile --production
  ```

**Stage 3: builder** -- extends deps-base
- Copy `package.json`, `bun.lock*`
- Full `bun install --frozen-lockfile` with same Bun cache mounts
- Copy all source files
- Run build with build artifact cache mount:
  ```dockerfile
  RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
      --mount=type=cache,target=/root/.cache/bun,sharing=locked \
      --mount=type=cache,target=/tmp/bun-build,sharing=locked \
      cp bunfig.build.toml bunfig.toml && \
      bun run svelte-kit sync && \
      bun run build:no-telemetry
  ```
- Clean up unnecessary files (.git, .github, node_modules/.cache, tests, docs, coverage, etc.)
- `mkdir -p build` (ensure artifact path exists)

**Cache hierarchy** (per bun-docker-security-guide):
- Layer 1 (BuildKit cache mounts): APK packages, Bun install cache, build artifacts -- persists across builds on the same machine
- Layer 2 (CI dependency cache): Already handled by the existing `actions/cache` in the CI workflow
- Layer 3 (Registry image cache): Already handled by the existing `cache-from`/`cache-to` in the CI workflow

When only application source changes, Docker skips the deps-prod stage entirely (its inputs -- `package.json` and `bun.lock` -- have not changed). Only the builder stage rebuilds. All three cache layers work together to reduce cold builds from minutes to seconds.

**Stage 4: production** -- `oven/bun:1.3.11-alpine`
- No binary copies needed (Alpine has Bun installed)
- No dumb-init wrapper
- No musl/shared lib copies

Copy from other stages:
- `node_modules/` from deps-prod
- `package.json` from deps-prod
- `build/` from builder

All files owned by `65532:65532` (nonroot).

Build args declared as `ARG` and converted to `ENV`:
- `BUILD_VERSION` (default: `development`) -- read by health check endpoint
- `COMMIT_HASH` (default: `unknown`) -- read by health check endpoint
- `BUILD_DATE` -- read by health check endpoint
- `NODE_ENV` (default: `production`)

Additional ENV: `PORT=3000`, `HOST=0.0.0.0`

OCI metadata ARGs: `SERVICE_NAME`, `SERVICE_VERSION`, `SERVICE_DESCRIPTION`, `SERVICE_AUTHOR`, `SERVICE_LICENSE`, `VCS_REF`

OCI labels block using the `SERVICE_*` and `VCS_REF` ARGs (consumed by CI pipeline build-args from Phase 1).

Runtime configuration:
- User: `65532:65532` (nonroot)
- EXPOSE: 3000
- HEALTHCHECK:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 \
      CMD ["/usr/local/bin/bun", "--eval", \
      "fetch(\"http://localhost:3000/api/health-check\").then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
  ```
  30s timeout accommodates the Simple health check mode (15s per-check timeout on 3 concurrent checks). 30s start-period allows SvelteKit server to initialize.
- ENTRYPOINT: `["/usr/local/bin/bun", "build/index.js"]` (direct, no dumb-init wrapper)

Note: The app uses `svelte-adapter-bun` (not `adapter-node`). The build output at `build/index.js` imports `build/start.js` which calls `Bun.serve()`. The `HOST` and `PORT` env vars are read by the adapter via `env("HOST", "0.0.0.0")` and `env("PORT", "3000")`.

**Intentionally removed** (production hardening):
- `NODE_DEBUG=http` -- verbose HTTP debug logging
- `BUN_CONFIG_VERBOSE_FETCH=true` -- verbose fetch logging
- These remain available via `docker run -e NODE_DEBUG=http` when debugging is needed

### 2. scripts/docker-build.sh

Per bun-runtime-guide "Docker Versioning from package.json" section.

Extracts `name`, `version`, `description`, `author`, `license` from `package.json` using `grep` (no jq dependency). Passes all of them as `--build-arg SERVICE_*` values.

Additionally passes:
- `--build-arg BUILD_VERSION="${SERVICE_VERSION}"` -- so the health check reports the correct version
- `--build-arg COMMIT_HASH="${VCS_REF}"` -- so the health check reports the correct commit (short git hash)
- `--build-arg BUILD_DATE="${BUILD_DATE}"`
- `--build-arg VCS_REF="${VCS_REF}"`

Tags the image with `<name>:<version>` and `<name>:latest`.

Targets `production` stage, builds for `linux/amd64` by default. Accepts optional positional arguments to override image name and tag.

Make executable: `chmod +x scripts/docker-build.sh`.

### 3. scripts/docker-security-check.sh

Validates:
1. Image size
2. Nonroot user (65532:65532)
3. Health check defined
4. OCI labels present
5. CVE scan (Docker Scout, if available)

Note: No "shell availability" check -- Alpine has a shell (unlike distroless). This is expected for the bun-ssr pattern.

Make executable: `chmod +x scripts/docker-security-check.sh`.

### 4. package.json docker script fixes

Replace all hardcoded versions with dynamic extraction from `package.json`.

**`docker:dev:build`**: Extract version dynamically. Tag as `capella-document-search:dev`.

**`docker:dev:run`**: Read version dynamically instead of hardcoded `0.0.1-dev`.

**`docker:prod:build`**: Replace with call to `scripts/docker-build.sh`. Remove hardcoded `BUILD_VERSION=0.0.1`.

**`docker:prod:run`**: Replace hardcoded `BUILD_VERSION=2.1.0` with dynamic extraction. Add `--read-only`, `--tmpfs /tmp:noexec,nosuid,size=100m`, `--cap-drop=ALL`, `--security-opt=no-new-privileges:true`.

**`docker:prod:restart`**: Fix reference to non-existent `docker:run:prod` (should be `docker:prod:run`).

**`docker:dev:restart`**: Fix reference to non-existent `docker:run:dev` (should be `docker:dev:run`).

Add new scripts:
- `"docker:build"`: `"bash scripts/docker-build.sh"` -- the canonical local build
- `"docker:security-check"`: `"bash scripts/docker-security-check.sh"` -- security validation

Cleanup scripts (`docker:cleanup:dev`, `docker:cleanup:prod`, `docker:stop`, `docker:clean`, `docker:logs:*`) remain unchanged.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `Dockerfile` | Rewrite | 4-stage Alpine build aligned with Docker Factory bun-ssr pattern |
| `scripts/docker-build.sh` | Create | Local build script extracting metadata from package.json |
| `scripts/docker-security-check.sh` | Create | Security validation script |
| `package.json` | Edit | Fix docker scripts: dynamic versions, security flags, broken references |

## What stays unchanged

- CI/CD workflow (`docker-ci-cd.yml`) -- already updated in Phase 1
- `.github/actions/setup-environment` composite action
- Security scan workflow (`security-scan.yml`)
- `.dockerignore` (already adequate)
- Container name conventions (`capella-search-dev`, `capella-search-prod`)
- `build:no-telemetry` build command

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| SvelteKit build output needs more than `build/` | Start with `build/` + `node_modules/` + `package.json`; add paths if runtime errors |
| Couchbase native addon requires additional libs | Alpine runtime has all system libraries -- no native addon risk (unlike distroless) |
| Alpine image larger than distroless | Acceptable tradeoff (~80-100MB vs ~50-80MB) for simplicity and factory alignment |
| Health check timeouts | 30s timeout + 30s start-period accommodates heavyweight Simple health check |

## Acceptance criteria

1. `docker build` produces a working Alpine image
2. Container runs as nonroot (65532:65532) verified by `docker inspect`
3. Health check at `/api/health-check` passes after container startup
4. `scripts/docker-security-check.sh` passes all checks
5. `bun run docker:build` builds successfully using version from `package.json`
6. `docker inspect` shows OCI labels with correct version, name, description, author, license
7. No hardcoded version strings remain in docker scripts
8. `BUILD_VERSION`, `COMMIT_HASH`, `BUILD_DATE` env vars available at runtime (verified via health check response)
9. Broken `docker:prod:restart` and `docker:dev:restart` references fixed
10. Dockerfile structure matches Docker Factory bun-ssr Scenario 3 output (4 stages: deps-base, deps-prod, builder, production on Alpine)
