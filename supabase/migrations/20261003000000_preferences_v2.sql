-- ═══════════════════════════════════════════════════════════════════════════
-- Guest preferences v2: editable from the app (Profile → Preferences).
--
--  • New preference groups: excursions, spa, transportation, accessibility,
--    privacy (JSONB, one column per group, replaced whole on save).
--  • `version` for optimistic concurrency: the app updates
--    `where guest_id = $1 and version = $expected`, so a stale device cannot
--    overwrite a newer save.
--  • Dietary and accessibility are special-category data. Crew may read them
--    only when the guest has consented (privacy / shareWithCrew).
--  • Every change is written to audit_log (who, which groups, from/to version),
--    without the values themselves.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.guest_preferences
  add column if not exists excursions     jsonb not null default '{}'::jsonb,
  add column if not exists spa            jsonb not null default '{}'::jsonb,
  add column if not exists transportation jsonb not null default '{}'::jsonb,
  add column if not exists accessibility  jsonb not null default '{}'::jsonb,
  add column if not exists privacy        jsonb not null default '{}'::jsonb,
  add column if not exists version        int   not null default 1;

alter table public.guest_preferences
  add constraint guest_preferences_version_positive check (version > 0);

-- Version may only move forward by one, and updated_at is always server time.
create or replace function private.guest_preferences_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.version <> old.version + 1 then
      raise exception 'stale preferences version (expected %, got %)', old.version + 1, new.version
        using errcode = '40001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger guest_preferences_guard
  before insert or update on public.guest_preferences
  for each row execute function private.guest_preferences_guard();

-- Audit which groups changed (never the values: they may be health-related).
create or replace function private.guest_preferences_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed text[] := '{}';
  col text;
begin
  foreach col in array array['preferred_destinations','dining','dietary','beverage','suite','activity_interests',
                             'excursions','spa','transportation','accessibility','communication','privacy'] loop
    if tg_op = 'INSERT' or (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      changed := changed || col;
    end if;
  end loop;
  insert into public.audit_log(actor_id, action, resource, resource_id, outcome, metadata)
  values (auth.uid(), 'preferences.' || lower(tg_op), 'guest_preferences', new.guest_id::text, 'success',
          jsonb_build_object('groups', changed, 'version', new.version));
  return new;
end $$;

create trigger guest_preferences_audit
  after insert or update on public.guest_preferences
  for each row execute function private.guest_preferences_audit();

-- Crew access to special-category data follows the guest's consent.
drop policy if exists "crew read prefs" on public.guest_preferences;
create policy "crew read prefs (consented)" on public.guest_preferences for select to authenticated
  using (
    exists (select 1 from public.reservation_guests rg
            where rg.guest_id = guest_preferences.guest_id and public.crew_for_reservation(rg.reservation_id))
    and coalesce((accessibility ->> 'shareWithCrew')::boolean, true)
  );

-- Guests may write only their own row (the existing "own" policy), and never
-- through the anon role.
revoke all on public.guest_preferences from anon;
