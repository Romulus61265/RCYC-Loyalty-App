-- Security audit fixes (docs/22). High findings H1, H2 and H4.
--
--   H1 · Crew reach their assignment, not the fleet.
--        is_crew() ignored the yacht entirely and gated every guest's value
--        segment, recommendations (crew-only opportunities included) and
--        behavioural signals; crew_for_reservation() treated a role with no
--        yacht as fleet-wide for every crew role, Suite Ambassadors included.
--   H2 · A concierge conversation is its guest's, and so are their messages.
--        Any party member could read another member's thread and post into
--        it, with an author name, intent, attachments or suggestions of their
--        choosing, all of which the AI and crew then read as context; and
--        special-assistance (medical) requests were visible to the whole party.
--   H4 · The concierge's rate limit is taken atomically, before the model is
--        called (it was a count of stored messages, which parallel requests
--        all passed), with a daily allowance per guest.

-- ─── H1 · Crew scope ───────────────────────────────────────────────────────
-- Only shore-side operations and administrators may hold a role with no yacht.
-- NOT VALID: existing rows are reviewed, new ones are refused.
alter table public.user_roles
  add constraint user_roles_onboard_roles_need_a_yacht
  check (role not in ('suite_ambassador', 'concierge_agent') or yacht_id is not null) not valid;

/** True when the caller is crew for the reservation's yacht (fleet-wide only for shore operations and admins). */
create or replace function public.crew_for_reservation(res uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.reservations r
    join public.voyages v on v.id = r.voyage_id
    join public.user_roles ur on ur.user_id = auth.uid()
    where r.id = res
      and ur.role in ('suite_ambassador', 'concierge_agent', 'shore_ops', 'admin')
      and (ur.yacht_id = v.yacht_id or (ur.yacht_id is null and ur.role in ('shore_ops', 'admin')))
  )
$$;

-- Guest-level data: crew serving one of the guest's reservations, not any crew.
drop policy if exists "crew" on public.guest_relationships;
create policy "crew" on public.guest_relationships for select to authenticated
  using (public.crew_for_guest(guest_id));

drop policy if exists "own guest recs" on public.recommendations;
create policy "own guest recs" on public.recommendations for select to authenticated
  using ((guest_id = public.current_guest_id() and audience = 'guest') or public.crew_for_guest(guest_id));

drop policy if exists "crew signals" on public.personalization_signals;
create policy "crew signals" on public.personalization_signals for select to authenticated
  using (public.crew_for_guest(guest_id));

-- ─── H2 · Concierge conversations are private to their guest ───────────────
drop policy if exists "party or crew" on public.concierge_conversations;
create policy "own or crew" on public.concierge_conversations for select to authenticated
  using (guest_id = public.current_guest_id() or public.crew_for_reservation(reservation_id));

drop policy if exists "party or crew" on public.concierge_messages;
create policy "own or crew" on public.concierge_messages for select to authenticated
  using (exists (select 1 from public.concierge_conversations c where c.id = conversation_id
                 and (c.guest_id = public.current_guest_id() or public.crew_for_reservation(c.reservation_id))));

-- A guest writes words, in their own conversation, as themselves. Everything the AI or crew
-- treat as structure (who is speaking, intent, attachments, suggestions) is server-written.
drop policy if exists "guest write" on public.concierge_messages;
create policy "guest write" on public.concierge_messages for insert to authenticated
  with check (
    author = 'guest' and author_user_id = auth.uid()
    and author_name is null and intent is null and attachments = '[]'::jsonb and suggestions = '{}'::text[]
    and classification is null and ai_confidence is null
    and char_length(body) between 1 and 2000
    and exists (select 1 from public.concierge_conversations c where c.id = conversation_id and c.guest_id = public.current_guest_id())
  );

-- Special-assistance (medical) requests: the guest who raised them, and crew. Other requests
-- stay visible to the party (a suite repair concerns everyone in it).
drop policy if exists "party or crew" on public.service_requests;
create policy "party or crew" on public.service_requests for select to authenticated
  using (
    public.crew_for_reservation(reservation_id)
    or (public.on_reservation(reservation_id)
        and (category <> 'special-assistance' or guest_id = public.current_guest_id() or created_by = auth.uid()))
  );

-- ─── H4 · Concierge allowance, taken atomically ────────────────────────────
create table public.concierge_rate_limits (
  user_id     uuid not null,
  bucket      text not null,       -- 'w:<window start epoch>' or 'd:<yyyy-mm-dd>'
  turns       int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, bucket)
);
alter table public.concierge_rate_limits enable row level security;
-- No policies: only the concierge function (service role) reads or writes it.
revoke all on public.concierge_rate_limits from authenticated, anon;

/**
 * One concierge turn for this user, if their allowance has room: at most
 * p_max per p_window_seconds and p_per_day per UTC day. Both counters are
 * incremented in one statement each, so concurrent calls cannot overrun.
 */
create or replace function public.concierge_take_slot(p_user uuid, p_window_seconds int, p_max int, p_per_day int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w text := 'w:' || (floor(extract(epoch from now()) / greatest(p_window_seconds, 1))::bigint * greatest(p_window_seconds, 1))::text;
  d text := 'd:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  in_window int;
  today int;
begin
  insert into public.concierge_rate_limits as l (user_id, bucket, turns) values (p_user, w, 1)
    on conflict (user_id, bucket) do update set turns = l.turns + 1, updated_at = now()
    returning turns into in_window;
  insert into public.concierge_rate_limits as l (user_id, bucket, turns) values (p_user, d, 1)
    on conflict (user_id, bucket) do update set turns = l.turns + 1, updated_at = now()
    returning turns into today;
  -- Old buckets are not needed once their window has passed.
  delete from public.concierge_rate_limits where user_id = p_user and updated_at < now() - interval '2 days';
  return in_window <= p_max and today <= p_per_day;
end $$;
revoke execute on function public.concierge_take_slot(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.concierge_take_slot(uuid, int, int, int) to service_role;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
