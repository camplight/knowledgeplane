#!/bin/sh
# Sign the distribution files. Run by whoever publishes the release.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
KEY=${KP_RELEASE_KEY:?Set KP_RELEASE_KEY to the release private key PEM}

files="
VERSION
Caddyfile
docker-compose.yml
env.example
setup.sh
bootstrap-db.sh
kp-load.sh
backup.sh
restore.sh
README.md
RESTORE.md
"

: > SHA256SUMS
for file in $files; do
  if [ ! -f "$file" ]; then
    echo "Missing $file" >&2
    exit 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" >> SHA256SUMS
  else
    shasum -a 256 "$file" >> SHA256SUMS
  fi
done

openssl dgst -sha256 -sign "$KEY" -out SHA256SUMS.sig SHA256SUMS
echo "Signed SHA256SUMS"
