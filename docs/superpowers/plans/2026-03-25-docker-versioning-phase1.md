# Docker Versioning Phase 1: package.json to CI/CD Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use `package.json` as the single source of truth for Docker image versioning and OCI metadata in the CI/CD pipeline.

**Architecture:** Add a CI step that extracts metadata from `package.json` (name, version, description, author, license), then wire those values into Docker tags, OCI labels, and build-args. No Dockerfile changes -- this only touches `package.json` and the GitHub Actions workflow.

**Tech Stack:** GitHub Actions, docker/metadata-action@v6, docker/build-push-action@v7

**Spec:** `docs/superpowers/specs/2026-03-25-docker-versioning-hardening-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Edit (lines 1-4) | Add `description`, `author`, `license` fields |
| `.github/workflows/docker-ci-cd.yml` | Edit (lines 60-101, 159) | Add metadata extraction step, update tags/labels/build-args/health test |

---

### Task 1: Add metadata fields to package.json

**Files:**
- Modify: `package.json:1-4`

- [ ] **Step 1: Add description, author, license fields**

Edit `package.json` to add the three missing fields after `"private": true`:

```json
{
  "name": "capella-document-search",
  "version": "2.2.0",
  "private": true,
  "description": "Document search application for Capella scopes and collections. Built with Bun, Svelte, and SvelteKit.",
  "author": "Simon Owusu",
  "license": "UNLICENSED",
  "type": "module",
```

- [ ] **Step 2: Verify the fields parse correctly**

Run: `bun -e "const pkg = JSON.parse(await Bun.file('./package.json').text()); console.log(pkg.name, pkg.version, pkg.description, pkg.author, pkg.license)"`

Expected output: `capella-document-search 2.2.0 Document search application for Capella scopes and collections. Built with Bun, Svelte, and SvelteKit. Simon Owusu UNLICENSED`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "SIO-XXX: Add description, author, license metadata to package.json"
```

---

### Task 2: Update CI workflow to use package.json metadata

All workflow changes are made in a single atomic edit to avoid broken intermediate states where extraction outputs exist but nothing consumes them.

**Files:**
- Modify: `.github/workflows/docker-ci-cd.yml`

- [ ] **Step 1: Insert "Extract package.json metadata" step**

Insert a new step after "Set up Docker Buildx" (line 60) and before "Extract metadata" (line 62):

```yaml
      - name: Extract package.json metadata
        id: package
        run: |
          SERVICE_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
          SERVICE_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
          SERVICE_DESCRIPTION=$(grep '"description"' package.json | head -1 | cut -d'"' -f4)
          SERVICE_AUTHOR=$(grep '"author"' package.json | head -1 | cut -d'"' -f4)
          SERVICE_LICENSE=$(grep '"license"' package.json | head -1 | cut -d'"' -f4)
          echo "service-name=$SERVICE_NAME" >> "$GITHUB_OUTPUT"
          echo "service-version=$SERVICE_VERSION" >> "$GITHUB_OUTPUT"
          echo "service-description=$SERVICE_DESCRIPTION" >> "$GITHUB_OUTPUT"
          echo "service-author=$SERVICE_AUTHOR" >> "$GITHUB_OUTPUT"
          echo "service-license=$SERVICE_LICENSE" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: Update metadata-action tags**

Add the version tag from package.json to the `tags` block in the "Extract metadata" step:

```yaml
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{date 'YYYYMMDD'}}-
            type=raw,value=latest,enable={{is_default_branch}}
            type=raw,value=${{ steps.package.outputs.service-version }},enable={{is_default_branch}}
```

The new line tags the image as `2.2.0` (or whatever `package.json` version is) on master pushes.

- [ ] **Step 3: Update metadata-action labels**

Replace hardcoded labels with package.json values:

```yaml
          labels: |
            org.opencontainers.image.title=${{ steps.package.outputs.service-name }}
            org.opencontainers.image.description=${{ steps.package.outputs.service-description }}
            org.opencontainers.image.vendor=${{ steps.package.outputs.service-author }}
            org.opencontainers.image.version=${{ steps.package.outputs.service-version }}
            org.opencontainers.image.licenses=${{ steps.package.outputs.service-license }}
            org.opencontainers.image.url=https://github.com/zx8086/capella-document-search
            org.opencontainers.image.source=https://github.com/zx8086/capella-document-search
```

Changes from current:
- `title`: was hardcoded `capella-document-search`, now from `steps.package.outputs.service-name`
- `description`: was hardcoded string, now from `steps.package.outputs.service-description`
- `vendor`: was `Siobytes`, now from `steps.package.outputs.service-author` (Simon Owusu)
- `version`: new field, from `steps.package.outputs.service-version`
- `licenses`: was hardcoded `MIT`, now from `steps.package.outputs.service-license` (UNLICENSED)
- `url` and `source`: remain hardcoded (these are repo URLs, not in package.json)

- [ ] **Step 4: Update build-push-action build-args**

Update the `build-args` block in the "Build and push Docker image" step:

```yaml
          build-args: |
            BUILD_DATE=${{ fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.created'] }}
            BUILD_VERSION=${{ steps.package.outputs.service-version }}
            COMMIT_HASH=${{ github.sha }}
            SERVICE_NAME=${{ steps.package.outputs.service-name }}
            SERVICE_VERSION=${{ steps.package.outputs.service-version }}
            SERVICE_DESCRIPTION=${{ steps.package.outputs.service-description }}
            SERVICE_AUTHOR=${{ steps.package.outputs.service-author }}
            SERVICE_LICENSE=${{ steps.package.outputs.service-license }}
```

Changes from current:
- `BUILD_VERSION`: was `${{ fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.version'] }}`, now from `steps.package.outputs.service-version` (the actual semver)
- `SERVICE_*` args: all new, passed through for OCI labels in the Dockerfile (consumed by Phase 2)

- [ ] **Step 5: Fix hardcoded BUILD_VERSION in health test**

In the "Test container health" step, change:

```yaml
            -e BUILD_VERSION=${{ github.ref_name || '0.0.1' }} \
```

to:

```yaml
            -e BUILD_VERSION=${{ steps.package.outputs.service-version }} \
```

- [ ] **Step 6: Verify YAML syntax**

Run: `bun run yaml:check`

If yamllint is not installed, manually verify the YAML is valid by checking indentation is consistent (6 spaces for step-level content).

- [ ] **Step 7: Commit all workflow changes**

```bash
git add .github/workflows/docker-ci-cd.yml
git commit -m "SIO-XXX: Source Docker tags, labels, and build-args from package.json"
```

---

### Task 3: Final review

- [ ] **Step 1: Review the complete diff**

Run: `git diff HEAD~2 -- package.json .github/workflows/docker-ci-cd.yml`

Verify:
1. `package.json` has `description`, `author` (Simon Owusu), `license` (UNLICENSED) fields
2. Workflow has "Extract package.json metadata" step with `id: package`
3. Tags include `type=raw,value=${{ steps.package.outputs.service-version }},enable={{is_default_branch}}`
4. Labels reference `steps.package.outputs.*` instead of hardcoded values
5. Build-args include `BUILD_VERSION=${{ steps.package.outputs.service-version }}` and all `SERVICE_*` args
6. Health test uses `steps.package.outputs.service-version` not `github.ref_name || '0.0.1'`
7. Existing tag patterns (branch, PR, SHA, latest) are preserved
8. No hardcoded version strings remain (except `url` and `source` which are repo URLs)

- [ ] **Step 2: Verify no unintended changes**

Run: `git status`

Expected: Only `package.json` and `.github/workflows/docker-ci-cd.yml` modified. Two commits total.
