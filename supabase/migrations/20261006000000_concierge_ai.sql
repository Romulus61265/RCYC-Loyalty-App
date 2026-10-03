-- ═══════════════════════════════════════════════════════════════════════════
-- Concierge AI: how each reply was produced.
--
--  • concierge_messages.classification: information / recommendation /
--    transactional, so the app (and crew) can see what kind of answer it was.
--  • concierge_ai_runs: one row per answered request, written only by the
--    concierge-respond Edge Function (service role). It records the decision,
--    never the text: provider and model, prompt version, which context slices
--    were sent, safety flags, guard findings, escalation, transaction outcome,
--    attempts, latency and token usage. request_id is unique, which makes a
--    retried request idempotent.
--  • Guests cannot read or write it; crew on the yacht can read it (to see why
--    the concierge handed a conversation over).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.concierge_messages
  add column if not exists classification text
    check (classification in ('information', 'recommendation', 'transactional'));

-- Guest-authored messages never carry a classification.
drop policy if exists "guest write" on public.concierge_messages;
create policy "guest write" on public.concierge_messages for insert to authenticated
  with check (author = 'guest' and author_user_id = auth.uid() and classification is null and ai_confidence is null
              and exists (select 1 from public.concierge_conversations c where c.id = conversation_id and public.on_reservation(c.reservation_id)));

create table public.concierge_ai_runs (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique,
  conversation_id uuid not null references public.concierge_conversations(id) on delete cascade,
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  actor_user_id   uuid not null references auth.users(id),
  provider        text not null,
  model           text not null,
  prompt_version  text not null,
  classification  text not null check (classification in ('information', 'recommendation', 'transactional')),
  context_slices  text[] not null default '{}',
  safety_flags    text[] not null default '{}',
  guard_findings  text[] not null default '{}',
  escalated_to    text check (escalated_to in ('suite-ambassador', 'concierge-team', 'medical')),
  transaction     jsonb not null default '{"type": "none", "status": "none"}'::jsonb,
  degraded        boolean not null default false,
  attempts        smallint not null default 0,
  latency_ms      integer not null default 0,
  usage           jsonb,
  message_ids     uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index on public.concierge_ai_runs (conversation_id, created_at desc);
create index on public.concierge_ai_runs (reservation_id, created_at desc);
create index on public.concierge_ai_runs (created_at desc) where degraded or escalated_to is not null;

alter table public.concierge_ai_runs enable row level security;
create policy "crew read" on public.concierge_ai_runs for select to authenticated
  using (public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.concierge_ai_runs from authenticated, anon;

-- ─── Self-check (as in 20261004): nothing in public left without RLS ──────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
