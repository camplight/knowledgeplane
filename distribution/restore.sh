#!/bin/sh
# Decrypt a custodian backup and restore it into the database volume.
# See RESTORE.md for the full runbook. This script stops at the decrypted
# archive unless --load is passed.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
archive=${1:?Usage: restore.sh <backup.tar.gz.cms> [--load]}
load=0
if [ "${2:-}" = "--load" ]; then
  load=1
fi
key=${CUSTODIAN_KEY:?Set CUSTODIAN_KEY to one custodian private key PEM}

plain=$(mktemp)
trap 'rm -f "$plain"' EXIT
openssl cms -decrypt -in "$archive" -inkey "$key" -out "$plain"
echo "Decrypted backup to a temporary archive"

if [ "$load" -eq 0 ]; then
  echo "Pass --load to stop the stack and arangorestore this archive"
  exit 0
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

docker compose stop mcp-server webapp background-workers
docker compose cp "$plain" db:/tmp/kp-restore.tar.gz
docker compose exec -T db sh -c 'mkdir -p /tmp/kp-restore && tar -C /tmp/kp-restore -xzf /tmp/kp-restore.tar.gz'
docker compose exec -T db arangorestore \
  --server.username root \
  --server.password "$ARANGO_ROOT_PASSWORD" \
  --server.database "${ARANGO_DB_NAME:-knowledgeplane}" \
  --input-directory /tmp/kp-restore/dump \
  --overwrite true
docker compose start mcp-server webapp background-workers
echo "Restore finished. Check https://\$PUBLIC_HOST/health"
