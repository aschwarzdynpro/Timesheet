#!/usr/bin/env bash
# Spielt alle Migrationen in eine frische Datenbank ein und laesst die Tests laufen.
#
#   ./scripts/test-db.sh
#
# Braucht ein erreichbares PostgreSQL 15+ mit btree_gist. Ohne Angabe wird eine
# lokale Wegwerf-Instanz unter /tmp gestartet und danach wieder entfernt.
set -euo pipefail

DB_NAME="${DB_NAME:-timesheet_test}"
TEST_USER_ID='11111111-1111-1111-1111-111111111111'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OWN_CLUSTER=0
if [ -z "${PGHOST:-}" ]; then
  OWN_CLUSTER=1
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  export PGDATA=/tmp/timesheet-pg/data
  export PGHOST=/tmp/timesheet-pg/sock
  export PGUSER=postgres
  rm -rf /tmp/timesheet-pg
  mkdir -p "$PGDATA" "$PGHOST"
  RUN_AS=""
  if [ "$(id -u)" = "0" ]; then
    id -u pgtest >/dev/null 2>&1 || useradd -m pgtest
    chown -R pgtest /tmp/timesheet-pg
    RUN_AS="su pgtest -c"
  fi
  if [ -n "$RUN_AS" ]; then
    $RUN_AS "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
    $RUN_AS "$PGBIN/pg_ctl -D $PGDATA -o \"-k $PGHOST -h ''\" -l /tmp/timesheet-pg/log start" >/dev/null
  else
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-k $PGHOST -h ''" -l /tmp/timesheet-pg/log start >/dev/null
  fi
  trap '$RUN_AS "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true' EXIT
fi

run() { psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" "$@"; }

echo "==> Datenbank $DB_NAME neu anlegen"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists \"$DB_NAME\";"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database \"$DB_NAME\";"

echo "==> Supabase-Plattform nachbilden"
run -f "$ROOT/supabase/tests/00_stub_supabase.sql"
run -c "insert into auth.users (id, email) values ('$TEST_USER_ID', 'test@example.com');"
psql -v ON_ERROR_STOP=1 -q -d postgres \
     -c "alter database \"$DB_NAME\" set \"request.jwt.claim.sub\" = '$TEST_USER_ID';"

echo "==> Migrationen einspielen"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  run -f "$f"
done

echo "==> Rechte fuer die Rolle authenticated (in Supabase Plattformvorgabe)"
run -c "grant usage on schema public to authenticated;
        grant all on all tables    in schema public to authenticated;
        grant all on all sequences in schema public to authenticated;
        grant execute on all functions in schema public to authenticated;"

echo "==> Beispieldaten einspielen"
run -f "$ROOT/supabase/seed.sql"

echo "==> Schematest"
run -f "$ROOT/supabase/tests/10_schema_test.sql"

echo "==> RLS-Test"
run -f "$ROOT/supabase/tests/20_rls_test.sql"

echo
echo "Alle Datenbanktests bestanden."
