#!/bin/sh
# Generate KnowledgePlane secrets on this machine. They are written to ENV_FILE
# and are not printed.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
ENV_FILE=${ENV_FILE:-"$ROOT/.env"}

if [ -f "$ENV_FILE" ]; then
  echo "Secrets file already exists: $ENV_FILE"
  exit 0
fi

umask 077
root_password=$(openssl rand -base64 24 | tr -d '\n')
app_password=$(openssl rand -base64 24 | tr -d '\n')
session_secret=$(openssl rand -base64 32 | tr -d '\n')
token_key=$(openssl rand -base64 32 | tr -d '\n')

cp "$ROOT/env.example" "$ENV_FILE"
# Placeholders are unique tokens in env.example.
sed -i.bak \
  -e "s|CHANGE_ME_ROOT_PASSWORD|$root_password|" \
  -e "s|CHANGE_ME_APP_PASSWORD|$app_password|" \
  -e "s|CHANGE_ME_SESSION_SECRET|$session_secret|" \
  -e "s|CHANGE_ME_TOKEN_SIGNING_KEY|$token_key|" \
  "$ENV_FILE"
rm -f "$ENV_FILE.bak"
echo "Wrote secrets to $ENV_FILE"
echo "Set PUBLIC_HOST, IMAGE_VERSION, and an OAuth provider before kp-load.sh"
