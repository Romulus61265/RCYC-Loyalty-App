-- ═══════════════════════════════════════════════════════════════════════════
-- After the voyage.
--
--  • voyage_feedback: the guest's reflections on a voyage they sailed
--    (favourite moments, a few words, thanks to crew, what could be better,
--    notes for next time). No scores. The guest reads and writes their own
--    while it is a draft; once sent it is read-only. Crew assigned to the
--    reservation read it: it is written for them.
--  • voyage_inspirations: future voyages to inspire the next one, read by
--    any signed-in guest. Fictional in development (seeded from fixtures).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.voyage_feedback (
  guest_id       uuid not null references public.guests(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  reflections    jsonb not null default '{}'::jsonb check (pg_column_size(reflections) < 16000),
  status         text not null default 'draft' check (status in ('draft', 'sent')),
  version        int not null default 1 check (version > 0),
  updated_at     timestamptz not null default now(),
  sent_at        timestamptz,
  primary key (guest_id, reservation_id),
  check ((status = 'sent') = (sent_at is not null))
);

create or replace function public.voyage_feedback_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'sent' and new.sent_at is null then new.sent_at := now(); end if;
  return new;
end $$;
create trigger voyage_feedback_touch before insert or update on public.voyage_feedback
  for each row execute function public.voyage_feedback_touch();

alter table public.voyage_feedback enable row level security;
create policy "own read" on public.voyage_feedback for select to authenticated
  using (guest_id = public.current_guest_id() or public.crew_for_reservation(reservation_id));
create policy "own insert" on public.voyage_feedback for insert to authenticated
  with check (guest_id = public.current_guest_id() and public.on_reservation(reservation_id));
-- Drafts only: a sent reflection is not edited.
create policy "own draft update" on public.voyage_feedback for update to authenticated
  using (guest_id = public.current_guest_id() and status = 'draft')
  with check (guest_id = public.current_guest_id() and public.on_reservation(reservation_id));
revoke delete on public.voyage_feedback from authenticated, anon;
grant select, insert, update on public.voyage_feedback to authenticated;

create table public.voyage_inspirations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text not null,
  yacht_name  text not null,
  start_date  date not null,
  end_date    date not null check (end_date > start_date),
  nights      int not null check (nights > 0),
  ports       text[] not null default '{}',
  tags        text[] not null default '{}',
  standfirst  text not null,
  highlight   text not null,
  hooks       jsonb not null default '{}'::jsonb,
  hero        jsonb,
  active      boolean not null default true
);

alter table public.voyage_inspirations enable row level security;
create policy "signed-in read" on public.voyage_inspirations for select to authenticated using (active);
revoke insert, update, delete on public.voyage_inspirations from authenticated, anon;
grant select on public.voyage_inspirations to authenticated;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
