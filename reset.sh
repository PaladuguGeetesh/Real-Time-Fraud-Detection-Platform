#!/usr/bin/env bash
# Wipes Redis and the Transaction/AuditLog MySQL tables back to a
# clean, empty state -- the same manual commands used throughout
# Phase 6 testing, scripted so they're never mistyped and always
# require explicit confirmation first.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

MYSQL_PASSWORD="devpassword"
MYSQL_DB="frauddb"

running_services=$(docker compose ps --status running --services)

for svc in mysql redis; do
  if ! grep -qx "$svc" <<<"$running_services"; then
    echo "Error: '$svc' is not running -- start the stack first (e.g. \`docker compose up -d\`) and try again." >&2
    exit 1
  fi
done

echo "This will permanently delete all Transaction, AuditLog, and Redis data."
read -r -p "Continue? [y/N] " confirm
case "$confirm" in
  y|Y|yes|YES) ;;
  *)
    echo "Aborted -- no changes made."
    exit 0
    ;;
esac

echo "Flushing Redis..."
docker compose exec -T redis redis-cli FLUSHDB

echo "Truncating MySQL tables..."
docker compose exec -T mysql mysql -u root -p"$MYSQL_PASSWORD" "$MYSQL_DB" \
  -e "TRUNCATE TABLE Transaction; TRUNCATE TABLE AuditLog;"

echo
echo "Verifying reset..."
txn_count=$(docker compose exec -T mysql mysql -u root -p"$MYSQL_PASSWORD" -N \
  -e "SELECT COUNT(*) FROM $MYSQL_DB.Transaction;" 2>/dev/null)
audit_count=$(docker compose exec -T mysql mysql -u root -p"$MYSQL_PASSWORD" -N \
  -e "SELECT COUNT(*) FROM $MYSQL_DB.AuditLog;" 2>/dev/null)
redis_keys=$(docker compose exec -T redis redis-cli KEYS '*')

echo "Transaction rows: $txn_count"
echo "AuditLog rows:    $audit_count"
if [ -z "$redis_keys" ]; then
  echo "Redis keys:        none (empty)"
else
  echo "Redis keys:        $redis_keys"
fi

if [ "$txn_count" = "0" ] && [ "$audit_count" = "0" ] && [ -z "$redis_keys" ]; then
  echo
  echo "Reset complete -- all data cleared."
else
  echo
  echo "Warning: reset may not be complete -- see counts above." >&2
  exit 1
fi
