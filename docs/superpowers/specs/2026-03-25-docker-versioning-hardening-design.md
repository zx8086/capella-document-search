# Docker Versioning and Security Hardening

## Goal

Align the Docker build pipeline with the bun-docker-security-guide and bun-runtime-guide by using `package.json` as the single source of truth for image versioning and metadata, and hardening the Dockerfile to production-grade distroless standards.

## Phasing

This work is split into two phases:

- **Phase 1** (this issue): package.json metadata + CI/CD pipeline versioning
- **Phase 2** (separate Linear issue): Dockerfile distroless hardening, local docker scripts, build script, security check script

## Current State

- `package.json` has `"version": "2.2.0"` but is missing `description`, `author`, and `license`
- CI/CD workflow (`docker-ci-cd.yml`) does not extract version from `package.json` -- tags are branch-based and SHA-based only
- CI health test hardcodes `BUILD_VERSION=${{ github.ref_name || '0.0.1' }}`
- OCI labels are hardcoded in the workflow, not sourced from `package.json`

## Phase 1 Deliverables

### 1. package.json metadata fields

Add missing fields required by OCI labels and CI tagging:

```json
{
  "description": "Document search application for Capella scopes and collections. Built with Bun, Svelte, and SvelteKit.",
  "author": "Simon Owusu",
  "license": "UNLICENSED"
}
```

### 2. CI/CD workflow update (docker-ci-cd.yml)

**Add "Extract package.json metadata" step** before the existing "Extract metadata" step:

```yaml
- name: Extract package.json metadata
  id: package
  run: |
    SERVICE_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
    SERVICE_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
    SERVICE_DESCRIPTION=$(grep '"description"' package.json | head -1 | cut -d'"' -f4)
    SERVICE_AUTHOR=$(grep '"author"' package.json | head -1 | cut -d'"' -f4)
    SERVICE_LICENSE=$(grep '"license"' package.json | head -1 | cut -d'"' -f4)
    echo "service-name=$SERVICE_NAME" >> $GITHUB_OUTPUT
    echo "service-version=$SERVICE_VERSION" >> $GITHUB_OUTPUT
    echo "service-description=$SERVICE_DESCRIPTION" >> $GITHUB_OUTPUT
    echo "service-author=$SERVICE_AUTHOR" >> $GITHUB_OUTPUT
    echo "service-license=$SERVICE_LICENSE" >> $GITHUB_OUTPUT
```

**Update `docker/metadata-action` tags:**
- Add `type=raw,value=${{ steps.package.outputs.service-version }},enable={{is_default_branch}}` for semver tag from package.json
- No `type=semver` patterns (these require Git tags, not package.json -- they would silently produce nothing on master pushes)
- Keep existing `type=ref,event=branch`, `type=ref,event=pr`, `type=sha`, `type=raw,value=latest`

**Update `docker/metadata-action` labels** to use package.json values:
- `org.opencontainers.image.title=${{ steps.package.outputs.service-name }}`
- `org.opencontainers.image.description=${{ steps.package.outputs.service-description }}`
- `org.opencontainers.image.vendor=${{ steps.package.outputs.service-author }}`
- `org.opencontainers.image.licenses=${{ steps.package.outputs.service-license }}`
- `org.opencontainers.image.version=${{ steps.package.outputs.service-version }}`

**Update `docker/build-push-action` build-args** to include:
- `BUILD_VERSION=${{ steps.package.outputs.service-version }}`
- `COMMIT_HASH=${{ github.sha }}`
- `SERVICE_NAME=${{ steps.package.outputs.service-name }}`
- `SERVICE_VERSION=${{ steps.package.outputs.service-version }}`
- `SERVICE_DESCRIPTION=${{ steps.package.outputs.service-description }}`
- `SERVICE_AUTHOR=${{ steps.package.outputs.service-author }}`
- `SERVICE_LICENSE=${{ steps.package.outputs.service-license }}`
- Keep existing `BUILD_DATE` and `BUILD_VERSION` args (update `BUILD_VERSION` source)

**Update "Test container health" step:** Use `BUILD_VERSION=${{ steps.package.outputs.service-version }}` instead of `${{ github.ref_name || '0.0.1' }}`.

## Phase 2 Deliverables (separate Linear issue)

Deferred to a separate issue:
- Dockerfile overhaul (distroless, pinned Bun, dumb-init, musl libs, OCI ARG/LABEL block, nonroot user)
- `scripts/docker-build.sh` (local build script extracting metadata from package.json)
- `scripts/docker-security-check.sh` (security validation script)
- package.json docker script fixes (replace hardcoded versions with dynamic extraction)
- Remove `NODE_DEBUG`/`BUN_CONFIG_VERBOSE_FETCH` from production
- `src/data` tmpfs mount documentation

## Files Changed (Phase 1)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Edit | Add `description`, `author`, `license` |
| `.github/workflows/docker-ci-cd.yml` | Edit | Add package.json metadata extraction, semver tags, OCI labels, build-args |

## Acceptance Criteria (Phase 1)

1. `package.json` has `description`, `author` (Simon Owusu), and `license` (UNLICENSED) fields
2. CI/CD workflow extracts version from `package.json` and tags images with it on master pushes
3. OCI labels in the workflow are sourced from `package.json` metadata, not hardcoded
4. `BUILD_VERSION` build-arg and CI health test use the `package.json` version
5. Existing tag patterns (branch, PR, SHA, latest) still work
