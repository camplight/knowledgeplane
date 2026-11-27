# Restore runbook

Backups are CMS envelopes encrypted to the certificates named in `CUSTODIAN_CERTS`. Give each certificate's private key to a different person. Either key can decrypt.

## 1. Stop writes

```sh
docker compose stop mcp-server webapp background-workers
```

## 2. Decrypt and restore

Put one custodian private key on the server only for the restore, then remove it.

```sh
export CUSTODIAN_KEY=/secure/custodian-a.key
./restore.sh backups/kp-YYYYMMDDTHHMMSSZ.tar.gz.cms --load
shred -u /secure/custodian-a.key 2>/dev/null || rm -f /secure/custodian-a.key
```

`restore.sh --load` copies the archive into the database container, runs `arangorestore` as root, and starts the application containers again.

## 3. Check

```sh
docker compose ps
curl -fsS "https://$PUBLIC_HOST/health"
```

Sign in, open a workspace, and search for a fact you know was in the backup.

## 4. If restore fails

Leave the application containers stopped. The database volume is still the previous data until `arangorestore --overwrite` finishes. Restore an older `backups/kp-*.tar.gz.cms` the same way.

Do not delete the `dbdata` volume. That is the live database, not the backup.

## Getting the data out without restoring

On a running stack, from the repository that contains the export script:

```sh
npx tsx scripts/kp-export.ts --out ./export --workspace <workspace-id>
```

That writes one Markdown file per fact plus `records.json` for facts and knowledge cards. It is a readable copy, not a substitute for the encrypted backup.
