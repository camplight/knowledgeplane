#!/bin/sh
# Dump the database and encrypt the archive to two or more custodian certificates.
# Custodians hold the matching private keys. The archive is not readable here
# after encryption.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"

encrypt_file() {
  input=$1
  output=$2
  # shellcheck disable=SC2086
  openssl cms -encrypt -aes256 -binary -in "$input" -out "$output" $CUSTODIAN_CERTS
}

if [ "${1:-}" = "--encrypt" ]; then
  input=${2:?Usage: backup.sh --encrypt INPUT OUTPUT}
  output=${3:?Usage: backup.sh --encrypt INPUT OUTPUT}
  if [ -z "${CUSTODIAN_CERTS:-}" ]; then
    echo "Set CUSTODIAN_CERTS to two or more PEM certificates" >&2
    exit 1
  fi
  # shellcheck disable=SC2086
  set -- $CUSTODIAN_CERTS
  if [ "$#" -lt 2 ]; then
    echo "CUSTODIAN_CERTS needs at least two PEM certificates" >&2
    exit 1
  fi
  openssl cms -encrypt -aes256 -binary -in "$input" -out "$output" "$@"
  exit 0
fi

set -a
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi
set +a

if [ -z "${CUSTODIAN_CERTS:-}" ]; then
  echo "Set CUSTODIAN_CERTS to two or more PEM certificates" >&2
  exit 1
fi
set -- $CUSTODIAN_CERTS
if [ "$#" -lt 2 ]; then
  echo "CUSTODIAN_CERTS needs at least two PEM certificates" >&2
  exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

docker compose exec -T db arangodump \
  --server.username root \
  --server.password "$ARANGO_ROOT_PASSWORD" \
  --server.database "${ARANGO_DB_NAME:-knowledgeplane}" \
  --output-directory /tmp/kp-dump \
  --overwrite true
docker compose cp db:/tmp/kp-dump "$workdir/dump"
tar -C "$workdir" -czf "$workdir/dump.tar.gz" dump
mkdir -p "$ROOT/backups"
encrypt_file "$workdir/dump.tar.gz" "$ROOT/backups/kp-$stamp.tar.gz.cms"
echo "Wrote $ROOT/backups/kp-$stamp.tar.gz.cms"
