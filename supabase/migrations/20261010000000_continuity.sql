-- ═══════════════════════════════════════════════════════════════════════════
-- Shoreside-to-yacht continuity.
--
--  • flight_segments gains estimated_arrival: the latest estimate from a
--    flight-status source (no such source is integrated yet; journey-events
--    accepts `flight.delayed` from whatever publishes it).
--  • arrival_updates: what the guest is told when travel to the yacht changes
--    (guest-safe JSON written by the Edge Function). The party reads it.
--  • continuity_tasks: the changes the delay requires, one per team
--    (transfer, venue, embarkation, crew). No supplier or PMS integration
--    exists, so each is a task for a person to carry out and confirm; the
--    guest is told "requested" until then. Crew assigned to the reservation
--    read them and mark them done.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.flight_segments
  add column if not exists estimated_arrival timestamptz;

create or replace view public.flight_segments_local with (security_invoker = true) as
  select f.id, f.reservation_id, f.direction, f.carrier, f.flight_number, f.origin, f.destination,
         public.iso_local(f.departure, f.departure_tz) as departure,
         public.iso_local(f.arrival, f.arrival_tz)     as arrival,
         f.departure as departs_at, f.cabin, f.status, f.tracked_for_transfer,
         public.iso_local(f.estimated_arrival, f.arrival_tz) as estimated_arrival
  from public.flight_segments f;

create table public.arrival_updates (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  plan_key       text not null unique check (char_length(plan_key) between 1 and 200),
  update         jsonb not null,
  simulated      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on public.arrival_updates (reservation_id, created_at desc);

alter table public.arrival_updates enable row level security;
create policy "party or crew" on public.arrival_updates for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.arrival_updates from authenticated, anon;

create table public.continuity_tasks (
  id             uuid primary key default gen_random_uuid(),
  task_key       text not null unique check (char_length(task_key) between 1 and 250),
  plan_key       text not null,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  team           text not null check (team in ('transfer', 'venue', 'embarkation', 'crew')),
  action         jsonb not null,
  status         text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at     timestamptz not null default now(),
  done_at        timestamptz,
  done_by        uuid references auth.users(id)
);
create index on public.continuity_tasks (reservation_id, status);

alter table public.continuity_tasks enable row level security;
create policy "crew read" on public.continuity_tasks for select to authenticated using (public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.continuity_tasks from authenticated, anon;

grant select on public.arrival_updates, public.continuity_tasks to authenticated;
grant select on public.flight_segments_local to authenticated;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
