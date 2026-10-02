-- Minimal stand-ins for Supabase-managed schemas so the migration and RLS
-- smoke test can run against a plain PostgreSQL 15+ (CI or local).
-- Not needed when running `supabase db reset`.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
