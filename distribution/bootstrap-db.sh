#!/bin/sh
# Create the application database and a non-root user. Run after the database
# container is healthy and before the app containers start.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

docker compose up -d db
docker compose exec -T db arangosh \
  --server.username root \
  --server.password "$ARANGO_ROOT_PASSWORD" \
  --javascript.execute-string "
    const users = require('@arangodb/users');
    const name = '${ARANGO_DB_NAME:-knowledgeplane}';
    const user = '${ARANGO_USER:-kp}';
    const password = '${ARANGO_PASSWORD}';
    try { db._createDatabase(name); } catch (e) { if (e.errorNum !== 1207) throw e; }
    try { users.save(user, password); } catch (e) { if (e.errorNum !== 1702) users.replace(user, password); }
    users.grantDatabase(user, name, 'rw');
    users.grantDatabase(user, '_system', 'none');
  "
echo "Database user ${ARANGO_USER:-kp} can read and write ${ARANGO_DB_NAME:-knowledgeplane}"
