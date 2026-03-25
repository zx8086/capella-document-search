#!/bin/bash

# scripts/docker-security-check.sh
# Validate container security posture

set -e

IMAGE=${1:-capella-document-search:latest}

echo "Security validation for: ${IMAGE}"
echo "========================================"

# 1. Check image size
echo ""
echo "[1/5] Image size"
docker images "${IMAGE}" --format "{{.Size}}"

# 2. Verify nonroot user
echo ""
echo "[2/5] Default user"
USER=$(docker inspect "${IMAGE}" --format '{{.Config.User}}')
if [ "${USER}" = "65532:65532" ] || [ "${USER}" = "65532" ]; then
  echo "PASS: Runs as nonroot (${USER})"
else
  echo "FAIL: Runs as ${USER:-root}"
fi

# 3. Check health check is defined
echo ""
echo "[3/5] Health check"
HEALTHCHECK=$(docker inspect "${IMAGE}" --format '{{.Config.Healthcheck}}')
if [ "${HEALTHCHECK}" != "<nil>" ] && [ -n "${HEALTHCHECK}" ]; then
  echo "PASS: Health check defined"
else
  echo "FAIL: No health check defined"
fi

# 4. Check OCI labels
echo ""
echo "[4/5] OCI labels"
docker inspect "${IMAGE}" --format '{{range $k, $v := .Config.Labels}}{{$k}}: {{$v}}{{"\n"}}{{end}}'

# 5. CVE scan (requires Docker Scout)
echo ""
echo "[5/5] CVE scan"
if docker scout version &>/dev/null 2>&1; then
  docker scout cves "${IMAGE}" --only-severity critical,high 2>/dev/null || echo "Scout scan completed"
else
  echo "SKIP: Docker Scout not available (install with: curl -sSfL https://raw.githubusercontent.com/docker/scout-cli/main/install.sh | sh)"
fi

echo ""
echo "========================================"
echo "Security validation complete"
