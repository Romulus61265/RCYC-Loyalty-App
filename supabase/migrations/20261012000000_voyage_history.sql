-- ═══════════════════════════════════════════════════════════════════════════
-- Voyage history.
--
--  • voyage_history: one row per guest and past voyage, as the reservation
--    and shipboard systems recorded it: yacht, suite, destinations, the
--    moments ashore, at the spa and at the table (moments with a weight are
--    the personalization engine's history), preferences learned, and a
--    place reserved for photographs. Written by the integration (service
--    role); the guest reads their own; crew assigned to a current
--    reservation of theirs read it too.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.voyage_history (
  guest_id          uuid not null references public.guests(id) on delete cascade,
  voyage_id         uuid not null references public.voyages(id) on delete cascade,
  yacht_name        text not null,
  suite_label       text not null,
  destinations      jsonb not null default '[]'::jsonb check (jsonb_typeof(destinations) = 'array'),
  moments           jsonb not null default '[]'::jsonb check (jsonb_typeof(moments) = 'array'),
  saved_preferences jsonb not null default '[]'::jsonb check (jsonb_typeof(saved_preferences) = 'array'),
  photos            jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  updated_at        timestamptz not null default now(),
  primary key (guest_id, voyage_id)
);
create index on public.voyage_history (voyage_id);

alter table public.voyage_history enable row level security;
create policy "own read" on public.voyage_history for select to authenticated
  using (guest_id = public.current_guest_id()
         or exists (select 1 from public.reservation_guests rg where rg.guest_id = voyage_history.guest_id and public.crew_for_reservation(rg.reservation_id)));
revoke insert, update, delete on public.voyage_history from authenticated, anon;
grant select on public.voyage_history to authenticated;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
