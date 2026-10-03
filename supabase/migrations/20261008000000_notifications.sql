-- ═══════════════════════════════════════════════════════════════════════════
-- Contextual notifications and push.
--
--  • notifications (the outbound record) gains the guest-facing `type`, the
--    engine's `dedupe_key` (one row per contextual notification, ever), and
--    push delivery state. Rows are written by the notifications-dispatch
--    Edge Function (service role) and journey projections; guests may only
--    set read_at.
--  • notification_receipts: read state for contextual notifications (keys),
--    the guest's own only.
--  • push_devices: Expo push tokens, one row per device. Registered through
--    register_push_device(); a guest sees their own devices but never a token
--    column they did not need; crew and other guests see nothing.
--  • activities: when a programme item's time moves, its previous start and
--    the moment of the change, so the guest can be told precisely.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Outbound notifications ────────────────────────────────────────────────
alter table public.notifications
  add column if not exists type        text,
  add column if not exists dedupe_key  text,
  add column if not exists push_status text,
  add column if not exists push_ticket text;

update public.notifications set type = case category
    when 'reservation' then 'reservation'
    when 'concierge'   then 'service-update'
    else 'information'
  end
  where type is null;

alter table public.notifications
  alter column type set not null,
  alter column type set default 'information',
  add constraint notifications_type_check check (type in ('information', 'reminder', 'service-update', 'reservation', 'itinerary-change', 'urgent', 'recommendation')),
  add constraint notifications_dedupe_length check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),
  add constraint notifications_push_status_check check (push_status is null or push_status in ('sent', 'failed', 'dry-run', 'no-device'));

create unique index notifications_guest_dedupe on public.notifications (guest_id, dedupe_key) where dedupe_key is not null;

create or replace view public.notifications_local with (security_invoker = true) as
  select n.id, n.guest_id, n.reservation_id, n.channel, n.category, n.title, n.body, n.deep_link,
         public.iso_local(n.scheduled_for, n.time_zone) as scheduled_for,
         public.iso_local(n.delivered_at, n.time_zone)  as delivered_at,
         public.iso_local(n.read_at, n.time_zone)       as read_at,
         n.scheduled_for as scheduled_at, n.bypass_quiet_hours,
         n.type, n.dedupe_key
  from public.notifications n;

-- ─── Read receipts for contextual notifications ────────────────────────────
create table public.notification_receipts (
  guest_id         uuid not null references public.guests(id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 200),
  read_at          timestamptz not null default now(),
  primary key (guest_id, notification_key)
);

alter table public.notification_receipts enable row level security;
create policy "own receipts" on public.notification_receipts for select to authenticated using (guest_id = public.current_guest_id());
create policy "own receipts insert" on public.notification_receipts for insert to authenticated with check (guest_id = public.current_guest_id());
revoke update, delete on public.notification_receipts from authenticated, anon;

-- ─── Push devices ──────────────────────────────────────────────────────────
create table public.push_devices (
  id              uuid primary key default gen_random_uuid(),
  guest_id        uuid not null references public.guests(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  token           text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$'),
  platform        text not null check (platform in ('ios', 'android', 'web')),
  name            text check (name is null or char_length(name) <= 80),
  enabled         boolean not null default true,
  failure_count   int not null default 0,
  disabled_reason text,
  registered_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);
create index on public.push_devices (guest_id) where enabled;

alter table public.push_devices enable row level security;
create policy "own devices" on public.push_devices for select to authenticated
  using (guest_id = public.current_guest_id() and user_id = auth.uid());
create policy "own devices remove" on public.push_devices for delete to authenticated
  using (guest_id = public.current_guest_id() and user_id = auth.uid());
-- Registration only through the function below; the token is not readable back.
revoke all on public.push_devices from authenticated, anon;
grant select (id, platform, name, enabled, registered_at, last_seen_at) on public.push_devices to authenticated;
grant delete on public.push_devices to authenticated;

/**
 * Registers this device's Expo push token for the signed-in guest. A token
 * belongs to a device, so if it was registered by another account on this
 * device, it moves to this guest (the last to sign in receives the pushes).
 */
create or replace function public.register_push_device(p_token text, p_platform text, p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g uuid := public.current_guest_id();
  d uuid;
begin
  if g is null then raise exception 'no guest' using errcode = '42501'; end if;
  insert into public.push_devices (guest_id, user_id, token, platform, name)
    values (g, auth.uid(), p_token, p_platform, nullif(left(p_name, 80), ''))
  on conflict (token) do update
    set guest_id = excluded.guest_id, user_id = excluded.user_id, platform = excluded.platform, name = excluded.name,
        enabled = true, failure_count = 0, disabled_reason = null, last_seen_at = now()
  returning id into d;
  return d;
end $$;

revoke execute on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;

-- ─── Programme changes ─────────────────────────────────────────────────────
alter table public.activities
  add column if not exists previous_starts_at timestamptz,
  add column if not exists changed_at         timestamptz;

create or replace view public.activities_local with (security_invoker = true) as
  select a.id, a.voyage_id, a.reservation_id, a.day, a.title, a.location, a.kind, a.booking_id, a.category,
         public.iso_local(a.starts_at, a.time_zone) as start_local,
         public.iso_local(a.ends_at, a.time_zone)   as end_local,
         a.starts_at,
         public.iso_local(a.previous_starts_at, a.time_zone) as previous_start_local,
         public.iso_local(a.changed_at, a.time_zone)         as changed_local
  from public.activities a;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
