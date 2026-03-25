#!/bin/bash

# scripts/docker-build.sh
# Build Docker image with metadata from package.json

set -e

SERVICE_NAME=$(grep '"name"' package.json | head -1 | cut -d'"' -f4)
SERVICE_VERSION=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
SERVICE_DESCRIPTION=$(grep '"description"' package.json | head -1 | cut -d'"' -f4)
SERVICE_AUTHOR=$(grep '"author"' package.json | head -1 | cut -d'"' -f4)
SERVICE_LICENSE=$(grep '"license"' package.json | head -1 | cut -d'"' -f4)

BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

IMAGE_NAME=${1:-$SERVICE_NAME}
IMAGE_TAG=${2:-$SERVICE_VERSION}

echo "Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "----------------------------------------"
echo "Service: ${SERVICE_NAME} v${SERVICE_VERSION}"
echo "Build Date: ${BUILD_DATE}"
echo "Git Commit: ${VCS_REF}"
echo "----------------------------------------"

DOCKER_BUILDKIT=1 docker build \
  --target production \
  --platform linux/amd64 \
  --build-arg SERVICE_NAME="${SERVICE_NAME}" \
  --build-arg SERVICE_VERSION="${SERVICE_VERSION}" \
  --build-arg SERVICE_DESCRIPTION="${SERVICE_DESCRIPTION}" \
  --build-arg SERVICE_AUTHOR="${SERVICE_AUTHOR}" \
  --build-arg SERVICE_LICENSE="${SERVICE_LICENSE}" \
  --build-arg BUILD_DATE="${BUILD_DATE}" \
  --build-arg VCS_REF="${VCS_REF}" \
  --build-arg BUILD_VERSION="${SERVICE_VERSION}" \
  --build-arg COMMIT_HASH="${VCS_REF}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -t "${IMAGE_NAME}:latest" \
  .

echo "Successfully built: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Also tagged as: ${IMAGE_NAME}:latest"
docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
