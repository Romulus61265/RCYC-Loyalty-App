#!/usr/bin/env bash
# End-to-end Supabase check on plain PostgreSQL + PostgREST (no Docker).
#
#   PG_BIN=/usr/lib/postgresql/16/bin POSTGREST=/path/to/postgrest npm run test:supabase
#
# Creates a throwaway cluster, applies the local stubs, every migration, the
# seed and the SQL smoke tests, starts PostgREST in front of it and runs
# scripts/supabase/integration.ts. Everything is removed afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
POSTGREST="${POSTGREST:-$(command -v postgrest || true)}"
[ -x "$PG_BIN/pg_ctl" ] || { echo "PostgreSQL binaries not found (set PG_BIN)"; exit 2; }
[ -n "$POSTGREST" ] && [ -x "$POSTGREST" ] || { echo "PostgREST not found (set POSTGREST)"; exit 2; }

WORK="$(mktemp -d)"
PORT="${PG_PORT:-54391}"
REST_PORT="${REST_PORT:-54392}"
JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$WORK"; RUN_AS=(su postgres -c); fi
pgrun() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() {
  [ -n "${REST_PID:-}" ] && kill "$REST_PID" 2>/dev/null || true
  pgrun "$PG_BIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

pgrun "$PG_BIN/initdb -D $WORK/data -U postgres -A trust" >/dev/null
pgrun "$PG_BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK -c listen_addresses=127.0.0.1' -l $WORK/log start" >/dev/null
PSQL="$PG_BIN/psql -h $WORK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
cp "$ROOT"/supabase/tests/*.sql "$ROOT"/supabase/migrations/*.sql "$ROOT"/supabase/seed.sql "$WORK"/
[ ${#RUN_AS[@]} -gt 0 ] && chown postgres "$WORK"/*.sql

MIGRATIONS=$(cd "$ROOT/supabase/migrations" && ls ./*.sql | sed "s#^\./#-f $WORK/#" | tr '\n' ' ')
load() {
  pgrun "$PSQL -c 'create database $1'"
  pgrun "$PSQL -d $1 -f $WORK/00_local_stubs.sql $MIGRATIONS -f $WORK/seed.sql" 2>&1 | grep -v 'NOTICE\|wal_level\|HINT' || true
}
# The SQL smoke tests write, so each gets its own copy.
load smoke
load app
pgrun "$PSQL -c 'create database base'"
pgrun "$PSQL -d base -f $WORK/00_local_stubs.sql $MIGRATIONS" 2>&1 | grep -v 'NOTICE\|wal_level\|HINT' || true

echo "── SQL smoke tests"
{
  pgrun "$PSQL -d base -At -f $WORK/10_rls_smoke.sql -f $WORK/20_preferences_smoke.sql -f $WORK/40_index_audit.sql" 2>&1 | grep -v 'audit_log is append-only\|forbid_audit_mutation'
  pgrun "$PSQL -d smoke -At -f $WORK/30_integration_smoke.sql" 2>&1
} | tee "$WORK/sql.out" | grep -E '\|f$|NOT REFUSED|ERROR' && { echo "✘ SQL smoke test failed"; exit 1; }
echo "✔ $(grep -c '|t$' "$WORK/sql.out") SQL assertions passed"

# Optional: the guest's queries with another voyage's fleet-scale volume in the tables.
if [ -n "${SCALE_PROBE:-}" ]; then
  echo "── Scale probe"
  cp "$ROOT"/supabase/tests/90_scale_probe.sql "$WORK"/; [ ${#RUN_AS[@]} -gt 0 ] && chown postgres "$WORK"/90_scale_probe.sql
  pgrun "$PSQL -d smoke -At -f $WORK/90_scale_probe.sql" 2>&1 | grep 'scale probe'
fi

# PostgREST login role; the guest's invited account (linked by the trigger);
# and a second guest with no reservation.
pgrun "$PSQL -d app" <<SQL
create role authenticator noinherit login password 'authenticator';
insert into auth.users (id, email, email_confirmed_at) values ('b0000000-0000-0000-0000-0000000000a1', 'alexander.laurent@example.com', now());
grant anon, authenticated, service_role to authenticator;
insert into auth.users (id, email, email_confirmed_at) values ('b0000000-0000-0000-0000-0000000000b2', 'other.guest@example.com', now());
insert into public.guests (id, auth_user_id, salutation, first_name, last_name, email_masked, source_system)
  values ('c0000000-0000-0000-0000-0000000000b2', 'b0000000-0000-0000-0000-0000000000b2', 'Ms', 'Other', 'Guest', 'o•••@example.com', 'mock');
-- Crew: a Suite Ambassador (the guest's yacht) and a shore operations agent (fleet-wide).
insert into auth.users (id, email, email_confirmed_at) values
  ('b0000000-0000-0000-0000-0000000000c3', 'ambassador.crew@example.com', now()),
  ('b0000000-0000-0000-0000-0000000000d4', 'shore.crew@example.com', now());
-- The guest's spouse, on the same reservation, signs in too (linked by the trigger).
insert into auth.users (id, email, email_confirmed_at) values ('b0000000-0000-0000-0000-0000000000e5', 'camille.laurent@example.com', now());
-- A Suite Ambassador on a yacht the guest has never sailed (the seed's two are both in their history): must see nothing of this guest.
insert into public.yachts (id, name, tagline) values ('f0000000-0000-0000-0000-0000000000f6', 'Luminara', 'Another yacht in the fleet.');
insert into auth.users (id, email, email_confirmed_at) values ('b0000000-0000-0000-0000-0000000000f6', 'other.yacht.crew@example.com', now());
insert into public.user_roles (user_id, role, yacht_id) values
  ('b0000000-0000-0000-0000-0000000000f6', 'suite_ambassador', 'f0000000-0000-0000-0000-0000000000f6');
-- Onboard crew are scoped to a yacht (the guest's); shore operations are fleet-wide.
insert into public.user_roles (user_id, role, yacht_id) values
  ('b0000000-0000-0000-0000-0000000000c3', 'suite_ambassador',
   (select v.yacht_id from public.reservations r join public.voyages v on v.id = r.voyage_id join public.guests g on g.id = r.lead_guest_id where g.first_name = 'Alexander' limit 1)),
  ('b0000000-0000-0000-0000-0000000000d4', 'shore_ops', null);
SQL

cat > "$WORK/rest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PORT/app"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = $REST_PORT
server-host = "127.0.0.1"
CONF
"$POSTGREST" "$WORK/rest.conf" >"$WORK/rest.log" 2>&1 &
REST_PID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$REST_PORT/" && break; sleep 0.2; done

echo "── Services through PostgREST"
GUEST=$(pgrun "$PSQL -d app -At -c \"select auth_user_id from public.guests where first_name = 'Alexander'\"")
cd "$ROOT"
PGRST_URL="http://127.0.0.1:$REST_PORT" JWT_SECRET="$JWT_SECRET" GUEST_USER_ID="$GUEST" OTHER_USER_ID="b0000000-0000-0000-0000-0000000000b2" \
  CREW_USER_ID="b0000000-0000-0000-0000-0000000000c3" SHORE_USER_ID="b0000000-0000-0000-0000-0000000000d4" \
  COMPANION_USER_ID="b0000000-0000-0000-0000-0000000000e5" OTHER_YACHT_CREW_USER_ID="b0000000-0000-0000-0000-0000000000f6" \
  npx tsx "${INTEGRATION_SCRIPT:-scripts/supabase/integration.ts}"

echo "── Requests per screen"
PGRST_URL="http://127.0.0.1:$REST_PORT" JWT_SECRET="$JWT_SECRET" GUEST_USER_ID="$GUEST" OTHER_USER_ID="b0000000-0000-0000-0000-0000000000b2" \
  CREW_USER_ID="b0000000-0000-0000-0000-0000000000c3" SHORE_USER_ID="b0000000-0000-0000-0000-0000000000d4" INTEGRATION_AS_LIBRARY=1 \
  npx tsx scripts/supabase/request-profile.ts
