#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'The server checkout has local changes. Resolve them before updating.' >&2
  exit 1
fi

# VACUUM INTO produces a consistent SQLite backup, including committed WAL data.
# Backups live outside the image, as does the database itself.
if [[ -n "$(docker compose ps --status running -q app)" ]]; then
  docker compose exec -T app node --no-warnings --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
const path = process.env.JOBS_DB
if (existsSync(path)) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA busy_timeout = 30000')
  const target = `/app/backups/jobs-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  db.prepare('VACUUM INTO ?').run(target)
  db.close()
  console.log(`Database backup: ${target}`)
}
NODE
fi

git pull --ff-only
docker compose build --pull
docker compose up -d --wait --wait-timeout 120
echo 'Update running; verify the public URL separately.'
