-- Minimal stand-ins for Supabase-managed schemas so the migration and RLS
-- smoke test can run against a plain PostgreSQL 15+ (CI or local).
-- Not needed when running `supabase db reset`.
-- Roles are cluster-wide, so create them only once.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
-- Same lookup order as Supabase: legacy per-claim setting, then the claims JSON PostgREST sets.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
-- As on Supabase: the service role (Edge Functions) has full table access and bypasses RLS.
grant usage on schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
grant usage on schema auth to service_role;
