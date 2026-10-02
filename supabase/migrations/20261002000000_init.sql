-- ═══════════════════════════════════════════════════════════════════════════
-- Yacht Collection — Guest Companion MVP schema
--
-- Principles
--  • Supabase is the MVP system of engagement, NOT the system of record.
--    Every integration-sourced row carries (source_system, external_id).
--  • Row Level Security on every table. The anon key can read nothing.
--  • Raw PII lives in `private` schema, reachable only via SECURITY DEFINER
--    functions / Edge Functions using the service role.
--  • audit_log is append-only.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ─── Enumerations ──────────────────────────────────────────────────────────
create type app_role as enum ('guest', 'travel_companion', 'suite_ambassador', 'concierge_agent', 'shore_ops', 'admin');
create type source_system as enum ('mock', 'marriott-bonvoy', 'reservations-pms', 'shipboard-pms', 'crm', 'shore-ops', 'concierge-platform', 'supabase');
create type bonvoy_tier as enum ('member', 'silver', 'gold', 'platinum', 'titanium', 'ambassador');
create type reservation_status as enum ('confirmed', 'pending-documents', 'checked-in', 'onboard', 'completed', 'cancelled');
create type port_call_type as enum ('embark', 'port', 'sea', 'tender', 'overnight', 'disembark');
create type experience_category as enum ('dining', 'spa', 'excursion', 'marina', 'entertainment', 'transfer', 'private', 'wine', 'shopping', 'culture', 'event');
create type request_status as enum ('received', 'in_progress', 'awaiting_guest', 'confirmed', 'completed', 'declined', 'cancelled');
create type document_status as enum ('required', 'submitted', 'verified', 'expired', 'not-required');
create type event_severity as enum ('info', 'notice', 'action', 'urgent');
create type concierge_author as enum ('guest', 'ai', 'human');
create type service_team as enum ('shoreside-concierge', 'suite-ambassador', 'guest-services', 'medical', 'destination-services');

-- ─── Identity & roles ──────────────────────────────────────────────────────
create table public.guests (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  salutation       text not null,
  first_name       text not null,
  last_name        text not null,
  preferred_name   text,
  email_masked     text not null,
  phone_masked     text,
  home_city        text,
  guest_since      date not null default current_date,
  source_system    source_system not null default 'supabase',
  external_id      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_system, external_id)
);

-- Raw PII: never exposed through PostgREST.
create table private.guest_pii (
  guest_id         uuid primary key references public.guests(id) on delete cascade,
  email            text not null,
  phone            text,
  date_of_birth    date,
  nationality      text,
  passport_ref     text,         -- token/reference into the document vault, never the number
  updated_at       timestamptz not null default now()
);

create table public.user_roles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             app_role not null,
  -- Crew roles are scoped to a yacht; null = global (admin / shoreside).
  yacht_id         uuid,
  granted_at       timestamptz not null default now(),
  granted_by       uuid references auth.users(id),
  unique nulls not distinct (user_id, role, yacht_id)
);

-- ─── Loyalty (projection of Marriott Bonvoy) ───────────────────────────────
create table public.loyalty_memberships (
  guest_id             uuid primary key references public.guests(id) on delete cascade,
  programme            text not null default 'marriott-bonvoy',
  member_number_masked text not null,
  tier                 bonvoy_tier not null,
  tier_label           text not null,
  lifetime_status      text,
  member_since         date,
  points_balance       bigint,
  source_system        source_system not null default 'marriott-bonvoy',
  external_id          text,
  synced_at            timestamptz
);

create table public.guest_relationships (
  guest_id            uuid primary key references public.guests(id) on delete cascade,
  voyages_completed   int not null default 0,
  nights_sailed       int not null default 0,
  first_voyage_date   date,
  -- Internal; excluded from the guest-facing view.
  value_segment       text check (value_segment in ('emerging', 'established', 'distinguished', 'founding')),
  lifetime_value_band text,
  ambassador_name     text
);

create table public.privileges (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  title        text not null,
  description  text not null,
  category     text not null,
  basis        text not null check (basis in ('bonvoy-tier', 'voyage-tenure', 'suite-category', 'occasion', 'discretionary')),
  rule         jsonb not null default '{}'::jsonb  -- eligibility rule evaluated by the loyalty function
);

-- ─── Fleet & voyages ───────────────────────────────────────────────────────
create table public.yachts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  tagline         text,
  guest_capacity  int,
  suites          int,
  crew            int,
  length_m        numeric(6,2),
  highlights      text[] not null default '{}',
  hero_asset      text
);

create table public.suites (
  id           uuid primary key default gen_random_uuid(),
  yacht_id     uuid not null references public.yachts(id),
  number       text not null,
  name         text not null,
  category     text not null,
  deck         int not null,
  area_sqm     numeric(6,1),
  terrace_sqm  numeric(6,1),
  features     text[] not null default '{}',
  unique (yacht_id, number)
);

create table public.voyages (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text not null,
  yacht_id       uuid not null references public.yachts(id),
  start_date     date not null,
  end_date       date not null,
  region         text,
  hero_asset     text,
  source_system  source_system not null default 'reservations-pms',
  external_id    text
);

create table public.port_calls (
  id           uuid primary key default gen_random_uuid(),
  voyage_id    uuid not null references public.voyages(id) on delete cascade,
  day          int not null,
  call_date    date not null,
  type         port_call_type not null,
  port_name    text not null,
  country      text not null,
  time_zone    text not null,
  arrival      timestamptz,
  departure    timestamptz,
  all_aboard   timestamptz,
  summary      text,
  location     point,
  unique (voyage_id, day, port_name)
);

create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  booking_reference text unique not null,
  voyage_id         uuid not null references public.voyages(id),
  suite_id          uuid references public.suites(id),
  lead_guest_id     uuid not null references public.guests(id),
  status            reservation_status not null default 'confirmed',
  suite_ambassador  text,
  source_system     source_system not null default 'reservations-pms',
  external_id       text,
  created_at        timestamptz not null default now()
);

create table public.reservation_guests (
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  guest_id        uuid not null references public.guests(id) on delete cascade,
  relationship    text,               -- to the lead guest
  is_minor        boolean not null default false,
  primary key (reservation_id, guest_id)
);

create table public.embarkations (
  reservation_id        uuid primary key references public.reservations(id) on delete cascade,
  terminal_name         text not null,
  address               text not null,
  arrival_window_start  timestamptz not null,
  arrival_window_end    timestamptz not null,
  suite_ready_at        timestamptz,
  all_aboard            timestamptz not null,
  departure             timestamptz not null,
  check_in_status       text not null default 'not-started',
  notes                 text[] not null default '{}'
);

create table public.travel_documents (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid not null references public.reservations(id) on delete cascade,
  guest_id         uuid not null references public.guests(id) on delete cascade,
  type             text not null,
  label            text not null,
  status           document_status not null default 'required',
  detail           text,
  due_by           date,
  -- Path in the private `travel-documents` Storage bucket; never public.
  storage_path     text,
  updated_at       timestamptz not null default now()
);

-- ─── Preferences, companions, occasions ────────────────────────────────────
create table public.guest_preferences (
  guest_id               uuid primary key references public.guests(id) on delete cascade,
  preferred_destinations text[] not null default '{}',
  dining                 jsonb not null default '{}'::jsonb,
  dietary                jsonb not null default '{}'::jsonb,  -- health-adjacent: special category data
  beverage               jsonb not null default '{}'::jsonb,
  suite                  jsonb not null default '{}'::jsonb,
  activity_interests     text[] not null default '{}',
  communication          jsonb not null default '{}'::jsonb,
  updated_at             timestamptz not null default now()
);

create table public.travel_companions (
  id                 uuid primary key default gen_random_uuid(),
  guest_id           uuid not null references public.guests(id) on delete cascade,
  companion_guest_id uuid references public.guests(id) on delete set null,
  first_name         text not null,
  last_name          text not null,
  relationship       text not null,
  is_minor           boolean not null default false,
  notes              text
);

create table public.special_occasions (
  id           uuid primary key default gen_random_uuid(),
  guest_id     uuid not null references public.guests(id) on delete cascade,
  type         text not null check (type in ('anniversary', 'birthday', 'honeymoon', 'milestone', 'celebration')),
  label        text not null,
  occasion_date date not null,
  person_ids   uuid[] not null default '{}',
  recognition  text not null default 'discreet' check (recognition in ('celebrate', 'discreet', 'private'))
);

-- ─── Experiences ───────────────────────────────────────────────────────────
create table public.experiences (
  id                uuid primary key default gen_random_uuid(),
  voyage_id         uuid references public.voyages(id),      -- null = fleet-wide
  port_call_id      uuid references public.port_calls(id),
  category          experience_category not null,
  title             text not null,
  subtitle          text,
  description       text,
  duration_minutes  int,
  price_minor       int,
  currency          char(3),
  inclusive         boolean not null default false,
  private_available boolean not null default false,
  capacity          int,
  tags              text[] not null default '{}',
  hero_asset        text,
  active            boolean not null default true
);

create table public.experience_bookings (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  experience_id   uuid not null references public.experiences(id),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  party_size      int not null check (party_size > 0),
  venue           text,
  status          request_status not null default 'received',
  note            text,
  source_system   source_system not null default 'supabase',
  external_id     text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.day_schedule_items (
  id              uuid primary key default gen_random_uuid(),
  voyage_id       uuid not null references public.voyages(id) on delete cascade,
  reservation_id  uuid references public.reservations(id) on delete cascade, -- null = ship-wide event
  day             int not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  title           text not null,
  location        text,
  kind            text not null check (kind in ('booking', 'ship-event', 'port', 'recommendation')),
  booking_id      uuid references public.experience_bookings(id) on delete cascade
);

-- ─── Concierge ─────────────────────────────────────────────────────────────
create table public.concierge_conversations (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  guest_id        uuid not null references public.guests(id),
  assigned_team   service_team,
  assigned_agent  uuid references auth.users(id),
  ai_enabled      boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.concierge_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.concierge_conversations(id) on delete cascade,
  author           concierge_author not null,
  author_user_id   uuid references auth.users(id),
  author_name      text,
  body             text not null,
  intent           text,
  attachments      jsonb not null default '[]'::jsonb,
  suggestions      text[] not null default '{}',
  ai_confidence    numeric(4,3),
  created_at       timestamptz not null default now()
);

create table public.service_requests (
  id               uuid primary key default gen_random_uuid(),
  reservation_id   uuid not null references public.reservations(id) on delete cascade,
  conversation_id  uuid references public.concierge_conversations(id),
  type             text not null,
  summary          text not null,
  details          text,
  status           request_status not null default 'received',
  priority         text not null default 'routine' check (priority in ('routine', 'priority', 'urgent')),
  assigned_team    service_team not null default 'suite-ambassador',
  assigned_to      uuid references auth.users(id),
  next_update_by   timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.service_request_events (
  id           bigint generated always as identity primary key,
  request_id   uuid not null references public.service_requests(id) on delete cascade,
  from_status  request_status,
  to_status    request_status not null,
  note         text,
  actor        uuid references auth.users(id),
  at           timestamptz not null default now()
);

-- ─── Journey events (service continuity) ───────────────────────────────────
create table public.journey_events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  guest_ids       uuid[] not null default '{}',
  severity        event_severity not null default 'info',
  source          text not null,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null unique,          -- idempotent ingestion
  occurred_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

create table public.journey_alerts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.journey_events(id) on delete cascade,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  severity        event_severity not null,
  title           text not null,
  body            text not null,
  handled         text,
  action_label    text,
  action_route    text,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);

-- ─── Personalization ───────────────────────────────────────────────────────
create table public.personalization_signals (
  id          bigint generated always as identity primary key,
  guest_id    uuid not null references public.guests(id) on delete cascade,
  kind        text not null,
  value       jsonb not null,
  weight      numeric(5,3) not null default 1,
  observed_at timestamptz not null default now(),
  source      text not null
);

create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  guest_id        uuid not null references public.guests(id) on delete cascade,
  reservation_id  uuid references public.reservations(id) on delete cascade,
  surface         text not null,
  kind            text not null,
  experience_id   uuid references public.experiences(id),
  title           text not null,
  rationale       text not null,
  score           numeric(5,4) not null,
  drivers         text[] not null default '{}',
  audience        text not null default 'guest' check (audience in ('guest', 'crew')),
  model_version   text not null,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table public.recommendation_feedback (
  id                 bigint generated always as identity primary key,
  recommendation_id  uuid not null references public.recommendations(id) on delete cascade,
  guest_id           uuid not null references public.guests(id) on delete cascade,
  signal             text not null check (signal in ('viewed', 'dismissed', 'saved', 'booked')),
  at                 timestamptz not null default now()
);

-- ─── Audit (append-only) ───────────────────────────────────────────────────
create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_roles  app_role[],
  action       text not null,
  resource     text not null,
  resource_id  text,
  outcome      text not null check (outcome in ('success', 'failure')),
  request_id   text,
  ip_hash      text,
  metadata     jsonb not null default '{}'::jsonb
);

create or replace function private.forbid_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.forbid_audit_mutation();

-- ─── Indexes ───────────────────────────────────────────────────────────────
create index on public.reservations (lead_guest_id);
create index on public.reservation_guests (guest_id);
create index on public.experience_bookings (reservation_id, starts_at);
create index on public.day_schedule_items (voyage_id, day);
create index on public.concierge_messages (conversation_id, created_at);
create index on public.service_requests (reservation_id, status);
create index on public.journey_events (reservation_id, occurred_at desc);
create index on public.journey_alerts (reservation_id) where acknowledged_at is null;
create index on public.personalization_signals (guest_id, kind);
create index on public.recommendations (guest_id, surface, score desc);
create index on public.audit_log (actor_id, at desc);

-- ─── Authorization helpers ─────────────────────────────────────────────────
create or replace function public.current_guest_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.guests where auth_user_id = auth.uid()
$$;

create or replace function public.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;

create or replace function public.is_crew() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('suite_ambassador', 'concierge_agent', 'shore_ops', 'admin')
  )
$$;

/** True when the caller is on the reservation's party. */
create or replace function public.on_reservation(res uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.reservation_guests rg
    where rg.reservation_id = res and rg.guest_id = public.current_guest_id()
  )
$$;

/** True when the caller is crew assigned to the reservation's yacht. */
create or replace function public.crew_for_reservation(res uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.reservations r
    join public.voyages v on v.id = r.voyage_id
    join public.user_roles ur on ur.user_id = auth.uid()
    where r.id = res
      and ur.role in ('suite_ambassador', 'concierge_agent', 'shore_ops', 'admin')
      and (ur.yacht_id is null or ur.yacht_id = v.yacht_id)
  )
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'guests','user_roles','loyalty_memberships','guest_relationships','privileges','yachts','suites',
    'voyages','port_calls','reservations','reservation_guests','embarkations','travel_documents',
    'guest_preferences','travel_companions','special_occasions','experiences','experience_bookings',
    'day_schedule_items','concierge_conversations','concierge_messages','service_requests',
    'service_request_events','journey_events','journey_alerts','personalization_signals',
    'recommendations','recommendation_feedback','audit_log'
  ] loop
    -- Not FORCEd: the SECURITY DEFINER helpers below run as the table owner
    -- and must be able to read guests/user_roles without recursing into RLS.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data: readable by any signed-in user.
create policy "ref read" on public.yachts      for select to authenticated using (true);
create policy "ref read" on public.suites      for select to authenticated using (true);
create policy "ref read" on public.voyages     for select to authenticated using (true);
create policy "ref read" on public.port_calls  for select to authenticated using (true);
create policy "ref read" on public.privileges  for select to authenticated using (true);
create policy "ref read" on public.experiences for select to authenticated using (active);

-- Guests: self, or crew serving one of their reservations.
create policy "guest self" on public.guests for select to authenticated
  using (id = public.current_guest_id()
         or exists (select 1 from public.reservation_guests rg where rg.guest_id = guests.id and public.crew_for_reservation(rg.reservation_id)));
create policy "guest self update" on public.guests for update to authenticated
  using (id = public.current_guest_id()) with check (id = public.current_guest_id());

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Guest-owned profile data.
create policy "own" on public.loyalty_memberships for select to authenticated using (guest_id = public.current_guest_id());
create policy "own" on public.guest_preferences   for all    to authenticated using (guest_id = public.current_guest_id()) with check (guest_id = public.current_guest_id());
create policy "own" on public.travel_companions   for all    to authenticated using (guest_id = public.current_guest_id()) with check (guest_id = public.current_guest_id());
create policy "own" on public.special_occasions   for all    to authenticated using (guest_id = public.current_guest_id()) with check (guest_id = public.current_guest_id());
create policy "crew read prefs" on public.guest_preferences for select to authenticated
  using (exists (select 1 from public.reservation_guests rg where rg.guest_id = guest_preferences.guest_id and public.crew_for_reservation(rg.reservation_id)));
create policy "crew read occasions" on public.special_occasions for select to authenticated
  using (recognition <> 'private' and exists (select 1 from public.reservation_guests rg where rg.guest_id = special_occasions.guest_id and public.crew_for_reservation(rg.reservation_id)));

-- guest_relationships contains internal segmentation → crew only; guests use the view below.
create policy "crew" on public.guest_relationships for select to authenticated using (public.is_crew());

-- Reservation-scoped data: party members and assigned crew.
create policy "party or crew" on public.reservations for select to authenticated
  using (public.on_reservation(id) or public.crew_for_reservation(id));
create policy "party or crew" on public.reservation_guests for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.embarkations for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "own docs" on public.travel_documents for select to authenticated
  using (guest_id = public.current_guest_id() or public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.experience_bookings for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "party request" on public.experience_bookings for insert to authenticated
  with check (public.on_reservation(reservation_id) and status = 'received' and created_by = auth.uid());
create policy "crew manage" on public.experience_bookings for update to authenticated
  using (public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.day_schedule_items for select to authenticated
  using ((reservation_id is null and exists (select 1 from public.reservations r where r.voyage_id = day_schedule_items.voyage_id and public.on_reservation(r.id)))
         or public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));

-- Concierge.
create policy "party or crew" on public.concierge_conversations for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.concierge_messages for select to authenticated
  using (exists (select 1 from public.concierge_conversations c where c.id = conversation_id
                 and (public.on_reservation(c.reservation_id) or public.crew_for_reservation(c.reservation_id))));
-- Guests insert only their own guest-authored messages; AI messages are written by the Edge Function.
create policy "guest write" on public.concierge_messages for insert to authenticated
  with check (author = 'guest' and author_user_id = auth.uid()
              and exists (select 1 from public.concierge_conversations c where c.id = conversation_id and public.on_reservation(c.reservation_id)));
create policy "crew write" on public.concierge_messages for insert to authenticated
  with check (author = 'human' and author_user_id = auth.uid()
              and exists (select 1 from public.concierge_conversations c where c.id = conversation_id and public.crew_for_reservation(c.reservation_id)));
create policy "party or crew" on public.service_requests for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "party create" on public.service_requests for insert to authenticated
  with check (public.on_reservation(reservation_id) and status = 'received' and created_by = auth.uid());
create policy "crew manage" on public.service_requests for update to authenticated
  using (public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.service_request_events for select to authenticated
  using (exists (select 1 from public.service_requests s where s.id = request_id
                 and (public.on_reservation(s.reservation_id) or public.crew_for_reservation(s.reservation_id))));

-- Journey events: raw events are crew-only; guests see the alert projection.
create policy "crew" on public.journey_events for select to authenticated using (public.crew_for_reservation(reservation_id));
create policy "party or crew" on public.journey_alerts for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
create policy "party ack" on public.journey_alerts for update to authenticated
  using (public.on_reservation(reservation_id)) with check (public.on_reservation(reservation_id));

-- Personalization: guests only ever see guest-audience recommendations.
create policy "own guest recs" on public.recommendations for select to authenticated
  using ((guest_id = public.current_guest_id() and audience = 'guest') or public.is_crew());
create policy "own feedback" on public.recommendation_feedback for insert to authenticated
  with check (guest_id = public.current_guest_id());
create policy "crew signals" on public.personalization_signals for select to authenticated using (public.is_crew());

-- Audit: writes via Edge Functions (service role) only; admins may read.
create policy "admin read" on public.audit_log for select to authenticated using (public.has_role('admin'));

-- Column-level hardening: a guest may update their row but not provenance or masking.
revoke update on public.guests from authenticated;
grant update (preferred_name, salutation, home_city) on public.guests to authenticated;
-- Guests may only acknowledge alerts, not rewrite them.
revoke update on public.journey_alerts from authenticated;
grant update (acknowledged_at) on public.journey_alerts to authenticated;

-- ─── Guest-safe views ──────────────────────────────────────────────────────
-- Exposes the relationship without internal segmentation / value bands.
create or replace function public.my_relationship()
returns table (guest_id uuid, voyages_completed int, nights_sailed int, first_voyage_date date, ambassador_name text)
language sql stable security definer set search_path = public as $$
  select guest_id, voyages_completed, nights_sailed, first_voyage_date, ambassador_name
  from public.guest_relationships
  where guest_id = public.current_guest_id()
$$;
revoke execute on function public.my_relationship() from public, anon;
grant execute on function public.my_relationship() to authenticated;

-- ─── Realtime ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.concierge_messages, public.service_requests, public.journey_alerts;

-- ─── Storage (private buckets) ─────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('travel-documents', 'travel-documents', false)
  on conflict (id) do nothing;

-- Objects are stored as <guest_id>/<document_id>.<ext>
create policy "own documents read" on storage.objects for select to authenticated
  using (bucket_id = 'travel-documents' and (storage.foldername(name))[1] = public.current_guest_id()::text);
create policy "own documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'travel-documents' and (storage.foldername(name))[1] = public.current_guest_id()::text);
