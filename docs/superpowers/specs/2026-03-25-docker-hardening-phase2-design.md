# Docker Security Hardening Phase 2

## Goal

Harden the Dockerfile to production-grade distroless standards, create local build and security scripts, and fix hardcoded versions in docker scripts -- completing the work deferred from Phase 1 (SIO-611).

## Current State

- Dockerfile uses unpinned `oven/bun:canary-alpine`, no distroless stage, no dumb-init, no OCI labels, no health check
- No `scripts/docker-build.sh` or `scripts/docker-security-check.sh`
- Local docker scripts in `package.json` hardcode versions (`0.0.1`, `0.0.1-dev`, `2.1.0`)
- `NODE_DEBUG=http` and `BUN_CONFIG_VERBOSE_FETCH=true` baked into production image
- Production stage copies entire `/app/` from builder (bloated image)

## Deliverables

### 1. Dockerfile overhaul

Full rewrite per bun-docker-security-guide multi-stage pattern.

Syntax directive: `# syntax=docker/dockerfile:1` (floating latest stable, per guide convention)

**Stage 1: deps-base** -- `oven/bun:1.3.11-alpine`
- Install `ca-certificates` and `dumb-init` via apk with cache mounts
- This stage provides system dependencies shared by later stages

**Stage 2: deps-prod** -- extends deps-base
- Copy `package.json` and `bun.lock`
- Run `bun install --frozen-lockfile --production` with cache mounts
- The `couchbase` SDK has a postinstall script (`scripts/install.js`) that downloads a platform-specific prebuild (`.node` native addon). On Alpine, it downloads the `linuxmusl` variant which links against musl. This prebuild may require additional shared libraries beyond `libgcc_s` and `libstdc++` (notably `libcrypto`, `libssl`). If the distroless image fails at runtime with missing library errors, either copy the missing libs from deps-base or switch to `gcr.io/distroless/cc-debian12:nonroot` which includes glibc and more libraries.

**Stage 3: builder** -- extends deps-base
- Full `bun install --frozen-lockfile` with cache mounts
- Copy all source files
- Copy `bunfig.build.toml` as `bunfig.toml` (required for Bun build config)
- Run `bun run svelte-kit sync` (generates type stubs and route manifests)
- Run `bun run build:no-telemetry` (this script sets `NODE_ENV=production` inline, so the builder stage does not need to set it separately)

**Stage 4: production** -- `gcr.io/distroless/static-debian12:nonroot`

Copy from other stages:
- Bun binary from `oven/bun:1.3.11-alpine`
- `dumb-init` from deps-base
- musl dynamic linker (`/lib/ld-musl-*.so.1`) from deps-base
- Shared libraries (`libgcc_s.so.1`, `libstdc++.so.6`) from deps-base
- SSL libraries (`libcrypto.so.*`, `libssl.so.*`) from deps-base -- required by couchbase SDK native addon
- `node_modules/` from deps-prod
- `package.json` from deps-prod
- `build/` from builder

Build args declared as `ARG` and converted to `ENV` in production stage:
- `BUILD_VERSION` (default: `development`) -- read by health check endpoint via `process.env.BUILD_VERSION`
- `COMMIT_HASH` (default: `unknown`) -- read by health check endpoint via `process.env.COMMIT_HASH`. This is the short git hash (7 chars) for local builds, full SHA in CI.
- `BUILD_DATE` -- read by health check endpoint via `process.env.BUILD_DATE`
- `NODE_ENV` (default: `production`)

Additional ENV: `PORT=3000`, `HOST=0.0.0.0`

OCI metadata ARGs (separate from runtime ARGs above):
- `SERVICE_NAME`, `SERVICE_VERSION`, `SERVICE_DESCRIPTION`, `SERVICE_AUTHOR`, `SERVICE_LICENSE`
- `VCS_REF` -- short git hash for OCI `revision` label (same value as `COMMIT_HASH` in local builds)

OCI labels block using the `SERVICE_*` and `VCS_REF` ARGs (consumed by the CI pipeline build-args from Phase 1).

Runtime configuration:
- User: `65532:65532` (nonroot)
- EXPOSE: 3000
- HEALTHCHECK with extended timeouts for the heavyweight health endpoint:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 \
      CMD ["/usr/local/bin/bun", "--eval", "fetch('http://localhost:3000/api/health-check').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
  ```
  The `/api/health-check` endpoint (Simple mode, default) calls Internal Collections API, SQLite, and GraphQL with a 15s per-check timeout. The 30s Docker timeout accommodates this. The 30s start-period allows the SvelteKit server to initialize.
- ENTRYPOINT: `dumb-init --`
- CMD: `bun run ./build/index.js`

Note: The app uses `svelte-adapter-bun` (not `adapter-node`). The build output at `build/index.js` imports `build/start.js` which calls `Bun.serve()`. The `HOST` and `PORT` env vars are read by the adapter via `env("HOST", "0.0.0.0")` and `env("PORT", "3000")`.

**Intentionally removed** (production hardening):
- `NODE_DEBUG=http` -- verbose HTTP debug logging
- `BUN_CONFIG_VERBOSE_FETCH=true` -- verbose fetch logging
- These remain available via `docker run -e NODE_DEBUG=http` when debugging is needed

**Data directory**: The app uses `src/data/` for SQLite storage (`DB_DATA_DIR` config default). On distroless with read-only filesystem, this requires a tmpfs or volume mount at runtime. The Dockerfile does not create this directory; it is provided at runtime.

### 2. scripts/docker-build.sh

Per bun-runtime-guide "Docker Versioning from package.json" section.

Extracts `name`, `version`, `description`, `author`, `license` from `package.json` using `grep` (no jq dependency). Passes all of them as `--build-arg SERVICE_*` values.

Additionally passes:
- `--build-arg BUILD_VERSION="${SERVICE_VERSION}"` -- so the health check reports the correct version
- `--build-arg COMMIT_HASH="${VCS_REF}"` -- so the health check reports the correct commit
- `--build-arg BUILD_DATE="${BUILD_DATE}"`
- `--build-arg VCS_REF="${VCS_REF}"`

Tags the image with `<name>:<version>` and `<name>:latest`.

Targets `production` stage, builds for `linux/amd64` by default. Accepts optional positional arguments to override image name and tag.

Make executable: `chmod +x scripts/docker-build.sh`.

### 3. scripts/docker-security-check.sh

Per bun-docker-security-guide. Validates:
1. Image size
2. Nonroot user (65532:65532)
3. Health check defined
4. No shell available (distroless verification)
5. OCI labels present
6. CVE scan (Docker Scout, if available)

Make executable: `chmod +x scripts/docker-security-check.sh`.

### 4. package.json docker script fixes

Replace all hardcoded versions with dynamic extraction from `package.json`.

**`docker:dev:build`**: Extract version dynamically. Tag as `capella-document-search:dev` with version suffix `-dev`.

**`docker:dev:run`**: Read version dynamically instead of hardcoded `0.0.1-dev`. Add tmpfs mounts for SQLite and tmp.

**`docker:prod:build`**: Replace with call to `scripts/docker-build.sh`. Remove hardcoded `BUILD_VERSION=0.0.1`.

**`docker:prod:run`**: Replace hardcoded `BUILD_VERSION=2.1.0` with dynamic extraction. Add security flags: `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges:true`. Add tmpfs mounts:
- `--tmpfs /tmp:noexec,nosuid,size=100m` (required for Bun and npm packages that write to /tmp)
- `--tmpfs /app/src/data:noexec,nosuid,size=50m` (SQLite database)

**`docker:prod:restart`**: Fix reference to non-existent `docker:run:prod` (should be `docker:prod:run`).

**`docker:dev:restart`**: Fix reference to non-existent `docker:run:dev` (should be `docker:dev:run`).

Add new scripts:
- `"docker:build"`: `"bash scripts/docker-build.sh"` -- the canonical local build
- `"docker:security-check"`: `"bash scripts/docker-security-check.sh"` -- security validation

Cleanup scripts (`docker:cleanup:dev`, `docker:cleanup:prod`, `docker:stop`, `docker:clean`, `docker:logs:*`) remain unchanged.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `Dockerfile` | Rewrite | 4-stage distroless build with full hardening |
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
| Couchbase native addon missing shared libraries | Copy SSL libs (`libcrypto`, `libssl`) from Alpine deps-base. If still fails, run `ldd` on the `.node` file inside the builder to identify all deps. Fallback: switch to `gcr.io/distroless/cc-debian12:nonroot` |
| SvelteKit build output needs more than `build/` | Start with `build/` + `node_modules/` + `package.json`; add paths if runtime errors |
| SQLite/Bun writes fail on read-only filesystem | Add both `--tmpfs /tmp` and `--tmpfs /app/src/data` to all docker run scripts |
| Bun 1.3.11 pin may break if Alpine package versions shift | Pin is stable for reproducible builds; update when intentional |
| Health check timeouts | 30s timeout + 30s start-period accommodates the heavyweight Simple health check; monitor in production |

## Acceptance criteria

1. `docker build` produces a working distroless image under 100MB
2. Container runs as nonroot (65532:65532) verified by `docker inspect`
3. Health check at `/api/health-check` passes after container startup
4. `scripts/docker-security-check.sh` passes all 5 non-Scout checks
5. `bun run docker:build` builds successfully using version from `package.json`
6. `docker inspect` shows OCI labels with correct version, name, description, author, license
7. No hardcoded version strings remain in docker scripts
8. `BUILD_VERSION`, `COMMIT_HASH`, `BUILD_DATE` env vars available at runtime (verified via health check response)
9. Broken `docker:prod:restart` and `docker:dev:restart` references fixed
