-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase integration: everything the guest app reads and writes when
-- EXPO_PUBLIC_SERVICE_MODE=supabase.
--
--  • Authentication: guests are provisioned (invite / admin API), never
--    self-registered. A confirmed sign-in is linked to its guest record by
--    e-mail, server-side, and given the guest role.
--  • New entities: guest privileges, voyage days, flights, experience slots,
--    destinations, Discover collections, dining / spa / excursion booking
--    details, notifications. Renames: day_schedule_items → activities,
--    special_occasions → guest_occasions. View: voyage_guests.
--  • Audit fields (created_at, updated_at, created_by, updated_by) on every
--    domain table, stamped by trigger — never trusted from the client.
--  • Row changes on guest-writable tables are written to audit_log (who,
--    what, which columns; never values).
--  • Times are stored as timestamptz plus the IANA zone they happen in.
--    `*_local` views return ISO strings with the local offset, which is what
--    the app displays (port time, not device time).
--  • RLS on every table; every view is security_invoker; anon reaches nothing.
-- ═══════════════════════════════════════════════════════════════════════════

-- New enum value (usable once this migration has committed).
alter type experience_category add value if not exists 'wellness' after 'spa';

-- ─── Renames ───────────────────────────────────────────────────────────────
-- Policies, indexes and constraints follow the table.
alter table public.day_schedule_items rename to activities;
alter table public.special_occasions  rename to guest_occasions;

-- ─── Guest profile ─────────────────────────────────────────────────────────
alter table public.guests
  add column if not exists home_airport text check (home_airport ~ '^[A-Z]{3}$');

alter table public.guest_relationships
  add column if not exists yachts_sailed text[] not null default '{}';

-- One row per privilege a guest holds, optionally for one voyage.
create table public.guest_privileges (
  id            uuid primary key default gen_random_uuid(),
  guest_id      uuid not null references public.guests(id) on delete cascade,
  privilege_id  uuid not null references public.privileges(id) on delete cascade,
  voyage_id     uuid references public.voyages(id) on delete cascade,
  sort_order    int not null default 0,
  unique nulls not distinct (guest_id, privilege_id, voyage_id)
);

alter table public.privileges
  add constraint privileges_category_check
  check (category in ('arrival', 'suite', 'dining', 'wellness', 'shore', 'recognition', 'service'));

-- ─── Imagery and curation order ────────────────────────────────────────────
-- hero = { uri?, alt, tone: [from, to] } — resolved by the brand DAM.
alter table public.yachts      add column if not exists hero jsonb;
alter table public.suites      add column if not exists hero jsonb;
alter table public.voyages     add column if not exists hero jsonb;
alter table public.port_calls  add column if not exists hero jsonb;
alter table public.experiences add column if not exists hero jsonb;

-- ─── Experiences (catalogue) ───────────────────────────────────────────────
alter table public.experiences
  add column if not exists format              text not null default 'shared'
    check (format in ('private', 'small-group', 'shared', 'private-or-group')),
  add column if not exists includes            text[] not null default '{}',
  add column if not exists destination         text,
  add column if not exists availability_status text
    check (availability_status in ('available', 'limited', 'waitlist', 'unavailable')),
  add column if not exists availability_note   text,
  add column if not exists sort_order          int not null default 0;

-- Bookable times. `remaining` is maintained by crew / the reservations system.
create table public.experience_slots (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references public.experiences(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  remaining      int not null default 0 check (remaining >= 0),
  time_zone      text not null,
  unique (experience_id, starts_at),
  check (ends_at is null or ends_at > starts_at)
);

create table public.destinations (
  id            uuid primary key default gen_random_uuid(),
  voyage_id     uuid not null references public.voyages(id) on delete cascade,
  port_call_id  uuid references public.port_calls(id) on delete set null,
  name          text not null,
  country       text not null,
  standfirst    text not null,
  hero          jsonb,
  sort_order    int not null default 0,
  unique (voyage_id, name)
);

create table public.discover_collections (
  id              uuid primary key default gen_random_uuid(),
  voyage_id       uuid not null references public.voyages(id) on delete cascade,
  title           text not null,
  standfirst      text not null,
  category        text not null,
  -- Ordered list; an array keeps the editor's order without a join table.
  experience_ids  uuid[] not null default '{}',
  sort_order      int not null default 0
);

-- Shore experiences, as a guest-facing read model.
create view public.excursions with (security_invoker = true) as
  select e.* from public.experiences e where e.port_call_id is not null;

-- ─── Voyage programme ──────────────────────────────────────────────────────
create table public.voyage_days (
  id            uuid primary key default gen_random_uuid(),
  voyage_id     uuid not null references public.voyages(id) on delete cascade,
  day           int not null check (day > 0),
  day_date      date not null,
  port_call_id  uuid references public.port_calls(id) on delete set null,
  headline      text not null,
  dress_code    text,
  sunset        timestamptz,
  time_zone     text not null,
  unique (voyage_id, day)
);

alter table public.activities
  add column if not exists category  experience_category,
  add column if not exists time_zone text not null default 'UTC';

-- ─── Reservations, embarkation, flights ────────────────────────────────────
alter table public.reservations
  add column if not exists suite_ambassador_contact jsonb;

alter table public.embarkations
  add column if not exists luggage   jsonb,
  add column if not exists location  point,
  add column if not exists time_zone text not null default 'UTC';

create table public.flight_segments (
  id                    uuid primary key default gen_random_uuid(),
  reservation_id        uuid not null references public.reservations(id) on delete cascade,
  direction             text not null check (direction in ('inbound', 'outbound')),
  carrier               text not null,
  flight_number         text not null,
  origin                text not null check (origin ~ '^[A-Z]{3}$'),
  destination           text not null check (destination ~ '^[A-Z]{3}$'),
  departure             timestamptz not null,
  departure_tz          text not null,
  arrival               timestamptz not null,
  arrival_tz            text not null,
  cabin                 text not null check (cabin in ('economy', 'premium-economy', 'business', 'first')),
  status                text not null default 'scheduled' check (status in ('scheduled', 'delayed', 'departed', 'landed', 'cancelled')),
  tracked_for_transfer  boolean not null default false,
  source_system         source_system not null default 'reservations-pms',
  external_id           text,
  check (arrival > departure)
);

-- The guests travelling on each voyage (party members across reservations).
create view public.voyage_guests with (security_invoker = true) as
  select r.voyage_id, rg.reservation_id, rg.guest_id, rg.relationship, rg.is_minor,
         (rg.guest_id = r.lead_guest_id) as is_lead
  from public.reservation_guests rg
  join public.reservations r on r.id = rg.reservation_id;

-- ─── Bookings: dining, spa and excursion details ───────────────────────────
alter table public.experience_bookings
  add column if not exists title     text,
  add column if not exists category  experience_category,
  add column if not exists time_zone text;

alter table public.experience_bookings
  drop constraint if exists experience_bookings_party_size_check,
  add constraint experience_bookings_party_size_check check (party_size between 1 and 50),
  add constraint experience_bookings_note_length check (note is null or char_length(note) <= 1000),
  add constraint experience_bookings_end_after_start check (ends_at is null or ends_at > starts_at);

-- 1:1 details by booking kind. Read by the party; written by crew / systems.
create table public.dining_bookings (
  booking_id        uuid primary key references public.experience_bookings(id) on delete cascade,
  table_preference  text check (table_preference in ('window', 'terrace', 'quiet-corner', 'chefs-table', 'no-preference')),
  seating_note      text,
  dietary_shared    boolean not null default false,
  occasion_id       uuid references public.guest_occasions(id) on delete set null
);

create table public.spa_bookings (
  booking_id            uuid primary key references public.experience_bookings(id) on delete cascade,
  treatment_room        text,
  pressure              text check (pressure in ('light', 'medium', 'firm')),
  therapist_preference  text
);

create table public.excursion_bookings (
  booking_id     uuid primary key references public.experience_bookings(id) on delete cascade,
  meeting_point  text,
  guide_name     text,
  vehicle        text,
  return_by      timestamptz
);

-- Category and time zone come from the catalogue, never from the client.
create or replace function private.experience_booking_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e record;
begin
  select x.category, x.title, x.port_call_id, x.voyage_id into e
  from public.experiences x where x.id = new.experience_id;
  new.category := e.category;
  new.title := coalesce(nullif(btrim(new.title), ''), e.title);
  if new.time_zone is null then
    select pc.time_zone into new.time_zone from public.port_calls pc where pc.id = e.port_call_id;
  end if;
  if new.time_zone is null then
    select pc.time_zone into new.time_zone
    from public.reservations r join public.port_calls pc on pc.voyage_id = r.voyage_id
    where r.id = new.reservation_id
    order by abs(extract(epoch from (new.starts_at - (pc.call_date::timestamp at time zone pc.time_zone)))) limit 1;
  end if;
  new.time_zone := coalesce(new.time_zone, 'UTC');
  return new;
end $$;

create trigger experience_booking_defaults
  before insert or update of experience_id on public.experience_bookings
  for each row execute function private.experience_booking_defaults();

-- ─── Concierge ─────────────────────────────────────────────────────────────
alter table public.service_requests
  add column if not exists assigned_to_name text,
  add column if not exists time_zone        text not null default 'UTC',
  add constraint service_requests_summary_length check (char_length(summary) between 1 and 200),
  add constraint service_requests_details_length check (details is null or char_length(details) <= 2000),
  add constraint service_requests_type_check
    check (type in ('dining-change', 'transport', 'occasion', 'suite', 'excursion', 'medical', 'general'));

alter table public.concierge_messages
  add constraint concierge_messages_body_length check (char_length(body) between 1 and 4000);

-- One conversation per guest per reservation.
alter table public.concierge_conversations
  add constraint concierge_conversations_one_per_guest unique (reservation_id, guest_id);

-- ─── Notifications (outbound communication history) ────────────────────────
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  guest_id            uuid not null references public.guests(id) on delete cascade,
  reservation_id      uuid references public.reservations(id) on delete cascade,
  channel             text not null check (channel in ('push', 'email', 'sms', 'whatsapp', 'in-app')),
  category            text not null check (category in ('pre-voyage', 'travel', 'onboard', 'reservation', 'concierge', 'occasion', 'post-voyage')),
  title               text not null,
  body                text not null,
  -- In-app route only (e.g. /voyage). Never an external URL.
  deep_link           text check (deep_link ~ '^/[A-Za-z0-9_?=&/.-]*$' and deep_link !~ '^//'),
  scheduled_for       timestamptz not null,
  delivered_at        timestamptz,
  read_at             timestamptz,
  bypass_quiet_hours  boolean not null default false,
  time_zone           text not null default 'UTC'
);

-- ─── Journey alerts ────────────────────────────────────────────────────────
alter table public.journey_alerts
  add column if not exists event_type text,
  add column if not exists expires_at timestamptz,
  add column if not exists time_zone  text not null default 'UTC',
  add constraint journey_alerts_action_route_internal
    check (action_route is null or (action_route ~ '^/[A-Za-z0-9_?=&/.-]*$' and action_route !~ '^//'));

-- ─── Audit fields on every domain table ────────────────────────────────────
-- created_by / updated_by hold the auth user id. They are deliberately not
-- foreign keys: the audit trail must survive the deletion of an account.
create or replace function private.set_audit_fields() returns trigger
language plpgsql as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if actor is not null then
      -- End-user request: the server decides who and when.
      new.created_at := now();
      new.created_by := actor;
      new.updated_at := now();
      new.updated_by := actor;
    else
      -- Migration, seed or service-role sync: keep source timestamps.
      new.created_at := coalesce(new.created_at, now());
      new.updated_at := coalesce(new.updated_at, new.created_at);
    end if;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := actor;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'guests','loyalty_memberships','guest_relationships','privileges','guest_privileges','yachts','suites',
    'voyages','port_calls','voyage_days','reservations','reservation_guests','embarkations','flight_segments',
    'travel_documents','guest_preferences','travel_companions','guest_occasions','experiences','experience_slots',
    'destinations','discover_collections','experience_bookings','dining_bookings','spa_bookings',
    'excursion_bookings','activities','concierge_conversations','service_requests','journey_alerts',
    'notifications','recommendations','user_roles'
  ] loop
    execute format('alter table public.%I
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists created_by uuid,
      add column if not exists updated_by uuid', t);
    execute format('create trigger set_audit_fields before insert or update on public.%I
      for each row execute function private.set_audit_fields()', t);
  end loop;
end $$;

-- experience_bookings.created_by and service_requests.created_by predate this
-- migration as FKs to auth.users; keep them (the RLS policies rely on them).

-- ─── Row-change audit (guest-writable tables) ──────────────────────────────
-- Records actor, action and the names of changed columns — never values,
-- because notes, occasions and requests can contain personal information.
create or replace function private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed text[];
begin
  select coalesce(array_agg(n.key order by n.key), '{}') into changed
  from jsonb_each(rec) n
  where n.key not in ('created_at', 'updated_at', 'created_by', 'updated_by')
    and (tg_op <> 'UPDATE' or n.value is distinct from (to_jsonb(old) -> n.key));
  if tg_op = 'UPDATE' and cardinality(changed) = 0 then
    return new;
  end if;
  insert into public.audit_log (actor_id, actor_roles, action, resource, resource_id, outcome, metadata)
  values (
    auth.uid(),
    (select array_agg(ur.role) from public.user_roles ur where ur.user_id = auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    rec ->> 'id',
    'success',
    jsonb_build_object('columns', changed) || coalesce(jsonb_build_object('status', rec ->> 'status'), '{}'::jsonb)
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'experience_bookings','service_requests','concierge_conversations','travel_companions',
    'guest_occasions','journey_alerts','notifications'
  ] loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I
      for each row execute function private.audit_row_change()', t);
  end loop;
end $$;

-- ─── Authentication: link a confirmed sign-in to its guest record ─────────
-- Self-signup is disabled (config.toml). Accounts are created by invite or
-- the admin API. When the e-mail is confirmed, the account is linked to the
-- one guest whose private e-mail matches, if that guest is not yet linked.
create or replace function private.link_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  matches int;
  g uuid;
  is_lead boolean;
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;

  select count(*) into matches from private.guest_pii p where lower(p.email) = lower(new.email);
  if matches <> 1 then
    -- Unknown or ambiguous e-mail: never guess. Recorded for guest services.
    insert into public.audit_log (actor_id, action, resource, resource_id, outcome, metadata)
    values (new.id, 'auth.link', 'guest', null, 'failure', jsonb_build_object('reason', case when matches = 0 then 'no_match' else 'ambiguous' end));
    return new;
  end if;

  select p.guest_id into g
  from private.guest_pii p join public.guests gu on gu.id = p.guest_id
  where lower(p.email) = lower(new.email) and gu.auth_user_id is null;
  if g is null then
    insert into public.audit_log (actor_id, action, resource, resource_id, outcome, metadata)
    values (new.id, 'auth.link', 'guest', null, 'failure', jsonb_build_object('reason', 'already_linked'));
    return new;
  end if;

  update public.guests set auth_user_id = new.id where id = g and auth_user_id is null;
  select exists (select 1 from public.reservations r where r.lead_guest_id = g) into is_lead;
  insert into public.user_roles (user_id, role)
  values (new.id, case when is_lead then 'guest'::public.app_role else 'travel_companion'::public.app_role end)
  on conflict do nothing;
  insert into public.audit_log (actor_id, action, resource, resource_id, outcome, metadata)
  values (new.id, 'auth.link', 'guest', g::text, 'success', '{}'::jsonb);
  return new;
end $$;

create trigger link_guest_on_insert
  after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function private.link_auth_user();

create trigger link_guest_on_confirm
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.link_auth_user();

-- ─── Authorization helpers ─────────────────────────────────────────────────
/** True when the caller is crew serving one of the guest's reservations. */
create or replace function public.crew_for_guest(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.reservation_guests rg
    where rg.guest_id = g and public.crew_for_reservation(rg.reservation_id)
  )
$$;

/** True when the caller is the lead guest of the reservation. */
create or replace function public.leads_reservation(res uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reservations r where r.id = res and r.lead_guest_id = public.current_guest_id())
$$;

-- Guest-safe relationship, now with the yachts sailed.
drop function if exists public.my_relationship();
create function public.my_relationship()
returns table (guest_id uuid, voyages_completed int, nights_sailed int, first_voyage_date date, yachts_sailed text[], ambassador_name text)
language sql stable security definer set search_path = public as $$
  select guest_id, voyages_completed, nights_sailed, first_voyage_date, yachts_sailed, ambassador_name
  from public.guest_relationships
  where guest_id = public.current_guest_id()
$$;

-- The one private detail the Profile shows. Date of birth, passport and raw
-- contact details stay in the private schema.
create or replace function public.my_personal_details()
returns table (nationality text)
language sql stable security definer set search_path = public, private as $$
  select p.nationality from private.guest_pii p where p.guest_id = public.current_guest_id()
$$;

-- ─── Booking requests from the app ─────────────────────────────────────────
-- Guests may not update bookings directly (crew own them). These functions
-- allow exactly two things: cancel, or ask for a change (crew then confirm).
create or replace function public.cancel_experience_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b record;
begin
  select id, reservation_id, status into b from public.experience_bookings where id = p_booking for update;
  if not found or not public.on_reservation(b.reservation_id) then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if b.status in ('completed', 'cancelled', 'declined') then
    raise exception 'booking can no longer be cancelled' using errcode = '22023';
  end if;
  update public.experience_bookings set status = 'cancelled' where id = p_booking;
end $$;

create or replace function public.request_experience_booking_change(
  p_booking uuid, p_starts_at timestamptz default null, p_party_size int default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b record;
begin
  select id, reservation_id, status into b from public.experience_bookings where id = p_booking for update;
  if not found or not public.on_reservation(b.reservation_id) then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if b.status in ('completed', 'cancelled', 'declined') then
    raise exception 'booking can no longer be changed' using errcode = '22023';
  end if;
  if p_party_size is not null and (p_party_size < 1 or p_party_size > 50) then
    raise exception 'party size out of range' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  update public.experience_bookings
  set starts_at  = coalesce(p_starts_at, starts_at),
      ends_at    = case when p_starts_at is null then ends_at else null end,
      party_size = coalesce(p_party_size, party_size),
      note       = coalesce(p_note, note),
      status     = 'in_progress'
  where id = p_booking;
end $$;

-- ─── Local time ────────────────────────────────────────────────────────────
-- ISO-8601 with the zone's offset at that instant, e.g. 2027-05-15T20:30:00+02:00.
create or replace function public.iso_local(ts timestamptz, tz text) returns text
language sql stable set search_path = '' as $$
  select case when ts is null then null else
    to_char(ts at time zone z, 'YYYY-MM-DD"T"HH24:MI:SS')
    || case when off < 0 then '-' else '+' end
    || lpad((abs(off) / 3600)::text, 2, '0') || ':' || lpad(((abs(off) % 3600) / 60)::text, 2, '0')
  end
  from (select coalesce(tz, 'UTC') as z) zz,
       lateral (select extract(epoch from (ts at time zone zz.z) - (ts at time zone 'UTC'))::int as off) o
$$;

create view public.port_calls_local with (security_invoker = true) as
  select pc.id, pc.voyage_id, pc.day, pc.call_date, pc.type, pc.port_name, pc.country, pc.time_zone,
         public.iso_local(pc.arrival, pc.time_zone)    as arrival,
         public.iso_local(pc.departure, pc.time_zone)  as departure,
         public.iso_local(pc.all_aboard, pc.time_zone) as all_aboard,
         pc.summary, pc.location[1] as lat, pc.location[0] as lng, pc.hero
  from public.port_calls pc;

create view public.embarkations_local with (security_invoker = true) as
  select e.reservation_id, e.terminal_name, e.address,
         e.location[1] as lat, e.location[0] as lng,
         public.iso_local(e.arrival_window_start, e.time_zone) as arrival_window_start,
         public.iso_local(e.arrival_window_end, e.time_zone)   as arrival_window_end,
         public.iso_local(e.suite_ready_at, e.time_zone)       as suite_ready_at,
         public.iso_local(e.all_aboard, e.time_zone)           as all_aboard,
         public.iso_local(e.departure, e.time_zone)            as departure,
         e.check_in_status, e.luggage, e.notes, e.time_zone
  from public.embarkations e;

create view public.experience_bookings_local with (security_invoker = true) as
  select b.id, b.reservation_id, b.experience_id, b.category, b.title, b.venue,
         public.iso_local(b.starts_at, b.time_zone) as start_local,
         public.iso_local(b.ends_at, b.time_zone)   as end_local,
         b.starts_at, b.party_size, b.status, b.note
  from public.experience_bookings b;

create view public.activities_local with (security_invoker = true) as
  select a.id, a.voyage_id, a.reservation_id, a.day, a.title, a.location, a.kind, a.booking_id, a.category,
         public.iso_local(a.starts_at, a.time_zone) as start_local,
         public.iso_local(a.ends_at, a.time_zone)   as end_local,
         a.starts_at
  from public.activities a;

create view public.experience_slots_local with (security_invoker = true) as
  select s.id, s.experience_id,
         public.iso_local(s.starts_at, s.time_zone) as start_local,
         public.iso_local(s.ends_at, s.time_zone)   as end_local,
         (s.starts_at at time zone s.time_zone)::date as local_date,
         s.starts_at, s.remaining
  from public.experience_slots s;

create view public.flight_segments_local with (security_invoker = true) as
  select f.id, f.reservation_id, f.direction, f.carrier, f.flight_number, f.origin, f.destination,
         public.iso_local(f.departure, f.departure_tz) as departure,
         public.iso_local(f.arrival, f.arrival_tz)     as arrival,
         f.departure as departs_at, f.cabin, f.status, f.tracked_for_transfer
  from public.flight_segments f;

create view public.voyage_days_local with (security_invoker = true) as
  select d.id, d.voyage_id, d.day, d.day_date, d.port_call_id, d.headline, d.dress_code,
         public.iso_local(d.sunset, d.time_zone) as sunset
  from public.voyage_days d;

create view public.notifications_local with (security_invoker = true) as
  select n.id, n.guest_id, n.reservation_id, n.channel, n.category, n.title, n.body, n.deep_link,
         public.iso_local(n.scheduled_for, n.time_zone) as scheduled_for,
         public.iso_local(n.delivered_at, n.time_zone)  as delivered_at,
         public.iso_local(n.read_at, n.time_zone)       as read_at,
         n.scheduled_for as scheduled_at, n.bypass_quiet_hours
  from public.notifications n;

create view public.service_requests_local with (security_invoker = true) as
  select s.id, s.reservation_id, s.conversation_id, s.type, s.summary, s.details, s.status, s.priority,
         s.assigned_team, s.assigned_to_name,
         public.iso_local(s.created_at, s.time_zone)     as created_at,
         public.iso_local(s.updated_at, s.time_zone)     as updated_at,
         public.iso_local(s.next_update_by, s.time_zone) as next_update_by,
         s.created_at as created_ts
  from public.service_requests s;

create view public.journey_alerts_local with (security_invoker = true) as
  select a.id, a.event_id, a.event_type, a.reservation_id, a.severity, a.title, a.body, a.handled,
         a.action_label, a.action_route,
         public.iso_local(a.created_at, a.time_zone) as created_at,
         public.iso_local(a.expires_at, a.time_zone) as expires_at,
         a.acknowledged_at, a.created_at as created_ts
  from public.journey_alerts a;

-- ─── Indexes (every foreign key, plus the app's read paths) ────────────────
create index on public.guest_privileges (guest_id, sort_order);
create index on public.guest_privileges (privilege_id);
create index on public.guest_privileges (voyage_id);
create index on public.experience_slots (experience_id, starts_at);
create index on public.destinations (port_call_id);
create index on public.discover_collections (voyage_id, sort_order);
create index on public.voyage_days (port_call_id);
create index on public.flight_segments (reservation_id, departure);
create index on public.notifications (guest_id, scheduled_for desc);
create index on public.notifications (reservation_id);
create index on public.dining_bookings (occasion_id);
create index on public.activities (reservation_id);
create index on public.activities (booking_id);
create index on public.experiences (voyage_id, sort_order);
create index on public.experiences (port_call_id);
create index on public.experience_bookings (experience_id);
create index on public.voyages (yacht_id);
create index on public.reservations (voyage_id);
create index on public.reservations (suite_id);
create index on public.travel_documents (reservation_id);
create index on public.travel_documents (guest_id);
create index on public.travel_companions (guest_id);
create index on public.travel_companions (companion_guest_id);
create index on public.guest_occasions (guest_id, occasion_date);
create index on public.concierge_conversations (guest_id);
create index on public.service_requests (conversation_id);
create index on public.service_request_events (request_id);
create index on public.journey_alerts (event_id);
create index on public.recommendations (experience_id);
create index on public.recommendations (reservation_id);
create index on public.recommendation_feedback (recommendation_id);
create index on public.recommendation_feedback (guest_id);

-- ─── Row Level Security for the new tables ─────────────────────────────────
alter table public.guest_privileges     enable row level security;
alter table public.experience_slots     enable row level security;
alter table public.destinations         enable row level security;
alter table public.discover_collections enable row level security;
alter table public.voyage_days          enable row level security;
alter table public.flight_segments      enable row level security;
alter table public.dining_bookings      enable row level security;
alter table public.spa_bookings         enable row level security;
alter table public.excursion_bookings   enable row level security;
alter table public.notifications        enable row level security;

-- Catalogue and programme: readable by signed-in users.
create policy "ref read" on public.destinations         for select to authenticated using (true);
create policy "ref read" on public.discover_collections for select to authenticated using (true);
create policy "ref read" on public.voyage_days          for select to authenticated using (true);
create policy "ref read" on public.experience_slots     for select to authenticated
  using (exists (select 1 from public.experiences e where e.id = experience_id and e.active));

create policy "own or crew" on public.guest_privileges for select to authenticated
  using (guest_id = public.current_guest_id() or public.crew_for_guest(guest_id));

create policy "party or crew" on public.flight_segments for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));

-- Booking details follow the parent booking.
do $$
declare t text;
begin
  foreach t in array array['dining_bookings', 'spa_bookings', 'excursion_bookings'] loop
    execute format($p$create policy "party or crew" on public.%I for select to authenticated
      using (exists (select 1 from public.experience_bookings b where b.id = booking_id
                     and (public.on_reservation(b.reservation_id) or public.crew_for_reservation(b.reservation_id))))$p$, t);
    execute format($p$create policy "crew manage" on public.%I for all to authenticated
      using (exists (select 1 from public.experience_bookings b where b.id = booking_id and public.crew_for_reservation(b.reservation_id)))
      with check (exists (select 1 from public.experience_bookings b where b.id = booking_id and public.crew_for_reservation(b.reservation_id)))$p$, t);
  end loop;
end $$;

-- Notifications: the guest reads their own and may only mark them read.
-- Sending is done server-side (service role).
create policy "own or crew" on public.notifications for select to authenticated
  using (guest_id = public.current_guest_id() or public.crew_for_guest(guest_id));
create policy "own read receipt" on public.notifications for update to authenticated
  using (guest_id = public.current_guest_id()) with check (guest_id = public.current_guest_id());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The lead guest sees the status of every document in the party (never the
-- files: the storage policies stay per guest).
create policy "lead guest party docs" on public.travel_documents for select to authenticated
  using (public.leads_reservation(reservation_id));

-- Booking requests: only as a request, only for the caller's reservation,
-- only for an active experience on that voyage, never with provenance.
drop policy if exists "party request" on public.experience_bookings;
create policy "party request" on public.experience_bookings for insert to authenticated
  with check (
    public.on_reservation(reservation_id)
    and status = 'received'
    and created_by = auth.uid()
    and source_system = 'supabase' and external_id is null
    and exists (
      select 1 from public.experiences e join public.reservations r on r.id = experience_bookings.reservation_id
      where e.id = experience_bookings.experience_id and e.active and (e.voyage_id is null or e.voyage_id = r.voyage_id)
    )
  );

-- Service requests: guests raise them; crew assign and answer them.
drop policy if exists "party create" on public.service_requests;
create policy "party create" on public.service_requests for insert to authenticated
  with check (
    public.on_reservation(reservation_id)
    and status = 'received'
    and created_by = auth.uid()
    and assigned_to is null and assigned_to_name is null and next_update_by is null
    and (conversation_id is null or exists (
      select 1 from public.concierge_conversations c
      where c.id = conversation_id and c.reservation_id = service_requests.reservation_id and c.guest_id = public.current_guest_id()))
  );

-- Conversations: a party member opens their own; crew are assigned server-side.
create policy "party open" on public.concierge_conversations for insert to authenticated
  with check (
    public.on_reservation(reservation_id) and guest_id = public.current_guest_id()
    and assigned_team is null and assigned_agent is null and ai_enabled
  );

-- Feedback only on the caller's own guest-facing recommendations.
drop policy if exists "own feedback" on public.recommendation_feedback;
create policy "own feedback" on public.recommendation_feedback for insert to authenticated
  with check (
    guest_id = public.current_guest_id()
    and exists (select 1 from public.recommendations r
                where r.id = recommendation_id and r.guest_id = public.current_guest_id() and r.audience = 'guest')
  );

-- Occasions the guest keeps private are hidden from crew (policy carried
-- over from special_occasions). Loyalty privileges are read-only to guests.

-- ─── Realtime ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.notifications, public.experience_bookings;

-- ─── Privileges: authenticated only, never anon ────────────────────────────
-- The anon key is used for the sign-in endpoints only. It can reach no
-- table, view or function in the public schema. Functions created by later
-- migrations are not executable by default: grant them to `authenticated`
-- explicitly (including helpers used inside RLS policies).
revoke create on schema public from public, anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant select on
  public.excursions, public.voyage_guests, public.port_calls_local, public.embarkations_local,
  public.experience_bookings_local, public.activities_local, public.experience_slots_local,
  public.flight_segments_local, public.voyage_days_local, public.notifications_local,
  public.service_requests_local, public.journey_alerts_local
to authenticated;

-- Guests never write reference data, loyalty projections or the programme.
revoke insert, update, delete on
  public.yachts, public.suites, public.voyages, public.port_calls, public.voyage_days, public.privileges,
  public.guest_privileges, public.loyalty_memberships, public.guest_relationships, public.experiences,
  public.experience_slots, public.destinations, public.discover_collections, public.flight_segments,
  public.reservations, public.reservation_guests, public.embarkations, public.activities,
  public.journey_events, public.personalization_signals, public.recommendations, public.audit_log,
  public.user_roles
from authenticated;

-- ─── Self-checks: fail the migration if a table or view is left open ───────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v'
             and not coalesce(c.reloptions @> array['security_invoker=true'], false) loop
    raise exception 'View public.% must be security_invoker', r.relname;
  end loop;
end $$;
