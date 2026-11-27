#!/bin/sh
# Verify the signed distribution, then load it. Refuses a bundle whose files
# do not match the signature, and refuses the tag "latest".
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
PUB=${KP_RELEASE_PUBKEY:-"$ROOT/release-public.pem"}
VERIFY_ONLY=0
if [ "${1:-}" = "--verify-only" ]; then
  VERIFY_ONLY=1
fi

if [ ! -f SHA256SUMS ] || [ ! -f SHA256SUMS.sig ]; then
  echo "This bundle has no signature. Refusing to load." >&2
  exit 1
fi
if [ ! -f "$PUB" ]; then
  echo "Missing release public key: $PUB" >&2
  exit 1
fi

openssl dgst -sha256 -verify "$PUB" -signature SHA256SUMS.sig SHA256SUMS >/dev/null
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
else
  shasum -a 256 -c SHA256SUMS
fi

set -a
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi
set +a

if [ -z "${IMAGE_VERSION:-}" ] && [ -f VERSION ]; then
  IMAGE_VERSION=$(tr -d '[:space:]' < VERSION)
  export IMAGE_VERSION
fi
if [ -z "${IMAGE_VERSION:-}" ] || [ "$IMAGE_VERSION" = "latest" ]; then
  echo "IMAGE_VERSION must be a pinned release, not latest." >&2
  exit 1
fi

echo "Verified KnowledgePlane $IMAGE_VERSION"
if [ "$VERIFY_ONLY" -eq 1 ]; then
  exit 0
fi

docker compose up -d
echo "Loaded KnowledgePlane $IMAGE_VERSION"
echo "Next: distribution/backup.sh, then confirm /health on https://\$PUBLIC_HOST/health"
