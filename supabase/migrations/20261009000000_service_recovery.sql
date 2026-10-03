-- ═══════════════════════════════════════════════════════════════════════════
-- Service recovery.
--
--  • service_recovery_events: one per disruption (disruption_key), with the
--    full disruption (including the internal reason and the guest's own
--    words), its assessment and the plan: steps, crew brief, alternatives
--    offered. Written by the Edge Functions (service role); crew assigned to
--    the reservation read it; guests never do.
--  • recovery_notices: the guest-safe side of each event (the disruption
--    without its internal reason or quotes). The party reads it, and answers
--    only through respond_to_recovery_notice().
--  • goodwill_rules: business rules for goodwill and compensation, written
--    and approved by admins. The engine only matches approved, authorised,
--    effective rules, and only proposes.
--  • goodwill_policy: one row; financial goodwill (credits, refunds,
--    points) stays off until an admin switches it on.
--  • goodwill_proposals: what the rules proposed for a recovery. Crew only;
--    decided through decide_goodwill_proposal(), which checks the person's
--    role. An approval records authority to act; nothing is applied by it.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.service_recovery_events (
  id               uuid primary key default gen_random_uuid(),
  disruption_key   text not null unique check (char_length(disruption_key) between 1 and 200),
  reservation_id   uuid not null references public.reservations(id) on delete cascade,
  kind             text not null check (kind in ('transfer-delay', 'dining-cancellation', 'excursion-cancellation', 'suite-issue', 'port-change', 'weather-disruption', 'missed-service', 'guest-complaint')),
  source           text not null check (source in ('journey-event', 'detected', 'crew')),
  journey_event_id uuid references public.journey_events(id) on delete set null,
  severity         text not null check (severity in ('low', 'moderate', 'high', 'critical')),
  owner            text not null,
  escalate         boolean not null default false,
  follow_up_by     timestamptz not null,
  status           text not null default 'open' check (status in ('open', 'in-hand', 'resolved')),
  disruption       jsonb not null,
  plan             jsonb not null,
  engine_version   text not null,
  occurred_at      timestamptz not null,
  recorded_at      timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid references auth.users(id)
);
create index on public.service_recovery_events (reservation_id, recorded_at);
create index on public.service_recovery_events (journey_event_id);

alter table public.service_recovery_events enable row level security;
create policy "crew read" on public.service_recovery_events for select to authenticated using (public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.service_recovery_events from authenticated, anon;

create table public.recovery_notices (
  id                uuid primary key default gen_random_uuid(),
  recovery_event_id uuid not null unique references public.service_recovery_events(id) on delete cascade,
  reservation_id    uuid not null references public.reservations(id) on delete cascade,
  -- Guest-safe: no internal reason, no quotes (the Edge Function strips them).
  disruption        jsonb not null check (not (disruption ? 'guestIds') and not ((disruption -> 'reason') ? 'internal') and not ((disruption -> 'details') ? 'quote')),
  title             text not null check (char_length(title) between 1 and 200),
  status            text not null default 'open' check (status in ('open', 'resolved')),
  response          jsonb not null default '{}'::jsonb,
  occurred_at       timestamptz not null,
  created_at        timestamptz not null default now()
);
create index on public.recovery_notices (reservation_id, created_at);

alter table public.recovery_notices enable row level security;
create policy "party or crew" on public.recovery_notices for select to authenticated
  using (public.on_reservation(reservation_id) or public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.recovery_notices from authenticated, anon;

/**
 * The guest's answer to a notice: the alternative they chose (now a booking
 * request or a service request), or that they asked for help. The booking or
 * request must belong to the same reservation. One alternative per notice.
 */
create or replace function public.respond_to_recovery_notice(
  p_notice uuid, p_kind text, p_alternative text default null, p_title text default null, p_booking uuid default null, p_request uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n record;
begin
  select id, reservation_id, response, recovery_event_id into n from public.recovery_notices where id = p_notice for update;
  if not found or not public.on_reservation(n.reservation_id) then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;
  if p_booking is not null and not exists (select 1 from public.experience_bookings b where b.id = p_booking and b.reservation_id = n.reservation_id) then
    raise exception 'booking not on this reservation' using errcode = '42501';
  end if;
  if p_request is not null and not exists (select 1 from public.service_requests s where s.id = p_request and s.reservation_id = n.reservation_id) then
    raise exception 'request not on this reservation' using errcode = '42501';
  end if;

  if p_kind = 'accepted' then
    if n.response ? 'accepted' then raise exception 'already accepted' using errcode = '23505'; end if;
    if p_alternative is null or char_length(p_alternative) > 300 or p_title is null or char_length(p_title) > 200 or (p_booking is null and p_request is null) then
      raise exception 'invalid answer' using errcode = '22023';
    end if;
    update public.recovery_notices
      set response = response || jsonb_build_object('accepted', jsonb_strip_nulls(jsonb_build_object(
            'alternativeId', p_alternative, 'title', p_title, 'bookingId', p_booking, 'requestId', p_request, 'at', now()))),
          status = 'resolved'
      where id = n.id;
  elsif p_kind = 'assistance' then
    if n.response ? 'assistance' then raise exception 'already asked' using errcode = '23505'; end if;
    if p_request is null then raise exception 'invalid answer' using errcode = '22023'; end if;
    update public.recovery_notices
      set response = response || jsonb_build_object('assistance', jsonb_build_object('requestId', p_request, 'at', now()))
      where id = n.id;
  else
    raise exception 'invalid answer' using errcode = '22023';
  end if;

  update public.service_recovery_events set status = 'in-hand' where id = n.recovery_event_id and status = 'open';
  insert into public.audit_log (actor_id, action, resource, resource_id, outcome, metadata)
    values (auth.uid(), 'service_recovery.respond', 'recovery_notice', n.id::text, 'success', jsonb_build_object('kind', p_kind));
end $$;

revoke execute on function public.respond_to_recovery_notice(uuid, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.respond_to_recovery_notice(uuid, text, text, text, uuid, uuid) to authenticated;

-- ─── Goodwill: rules, policy, proposals ────────────────────────────────────
create table public.goodwill_rules (
  id             text primary key check (id ~ '^[a-z0-9_]{3,60}$'),
  version        int not null default 1 check (version > 0),
  status         text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  name           text not null check (char_length(name) between 1 and 120),
  applies_to     text[] not null check (cardinality(applies_to) > 0 and applies_to <@ array['transfer-delay', 'dining-cancellation', 'excursion-cancellation', 'suite-issue', 'port-change', 'weather-disruption', 'missed-service', 'guest-complaint']),
  min_severity   text not null check (min_severity in ('low', 'moderate', 'high', 'critical')),
  conditions     jsonb,
  action         jsonb not null check (action ->> 'kind' in ('gesture', 'amenity', 'upgrade', 'service-credit', 'refund', 'loyalty-points') and char_length(action ->> 'description') between 1 and 300),
  approval       jsonb not null check (approval ->> 'role' in ('suite_ambassador', 'concierge_agent', 'shore_ops', 'admin') and (approval ->> 'maxPerReservation')::int between 1 and 10),
  authorized_by  text,
  authorized_at  timestamptz,
  effective_from timestamptz,
  effective_to   timestamptz,
  updated_at     timestamptz not null default now(),
  -- An approved rule names who authorised it, and when.
  constraint goodwill_rules_authorised check (status <> 'approved' or (authorized_by is not null and authorized_at is not null)),
  -- Money moves only with a ceiling, and only by an admin's approval.
  constraint goodwill_rules_financial check (
    action ->> 'kind' not in ('service-credit', 'refund', 'loyalty-points')
    or (action ? 'maxValue' and approval ->> 'role' = 'admin'))
);

alter table public.goodwill_rules enable row level security;
create policy "crew read" on public.goodwill_rules for select to authenticated using (public.is_crew());
create policy "admin write" on public.goodwill_rules for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create table public.goodwill_policy (
  id                boolean primary key default true check (id),
  financial_enabled boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id)
);
insert into public.goodwill_policy (id) values (true);

alter table public.goodwill_policy enable row level security;
create policy "crew read" on public.goodwill_policy for select to authenticated using (public.is_crew());
create policy "admin update" on public.goodwill_policy for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
revoke insert, delete on public.goodwill_policy from authenticated, anon;

create table public.goodwill_proposals (
  id                uuid primary key default gen_random_uuid(),
  proposal_key      text not null unique check (char_length(proposal_key) between 1 and 300),
  recovery_event_id uuid not null references public.service_recovery_events(id) on delete cascade,
  reservation_id    uuid not null references public.reservations(id) on delete cascade,
  rule_id           text not null references public.goodwill_rules(id),
  rule_version      int not null,
  action            jsonb not null,
  financial         boolean not null,
  approval_role     app_role not null,
  rationale         text not null,
  status            text not null default 'proposed' check (status in ('proposed', 'approved', 'declined')),
  proposed_at       timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid references auth.users(id),
  note              text check (note is null or char_length(note) <= 500),
  constraint goodwill_proposals_financial_admin check (not financial or approval_role = 'admin')
);
create index on public.goodwill_proposals (reservation_id, status);
create index on public.goodwill_proposals (recovery_event_id);
create index on public.goodwill_proposals (rule_id);

alter table public.goodwill_proposals enable row level security;
create policy "crew read" on public.goodwill_proposals for select to authenticated using (public.crew_for_reservation(reservation_id));
revoke insert, update, delete on public.goodwill_proposals from authenticated, anon;

/**
 * A crew member's decision on a goodwill proposal. Only someone holding the
 * role the rule names (or an admin) may decide; financial proposals need an
 * admin and the policy switched on; approval re-checks the rule as it stands
 * now and its limit per reservation. Approving records the authority to
 * carry the gesture out; it does not carry it out.
 */
create or replace function public.decide_goodwill_proposal(p_proposal uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  r record;
  approved int;
begin
  select * into p from public.goodwill_proposals where id = p_proposal for update;
  if not found or not public.crew_for_reservation(p.reservation_id) then
    raise exception 'proposal not found' using errcode = 'P0002';
  end if;
  if p.status <> 'proposed' then raise exception 'already decided' using errcode = '23505'; end if;
  if not (public.has_role('admin') or public.has_role(p.approval_role)) then
    raise exception 'not authorised to decide this proposal' using errcode = '42501';
  end if;

  if p_approve then
    select * into r from public.goodwill_rules where id = p.rule_id;
    if r.version <> p.rule_version or r.status <> 'approved' or r.authorized_by is null
       or (r.effective_from is not null and r.effective_from > now()) or (r.effective_to is not null and r.effective_to <= now()) then
      raise exception 'rule no longer in force' using errcode = '23514';
    end if;
    if p.financial and (not public.has_role('admin') or not (select financial_enabled from public.goodwill_policy)) then
      raise exception 'financial goodwill is not enabled' using errcode = '42501';
    end if;
    select count(*) into approved from public.goodwill_proposals
      where reservation_id = p.reservation_id and rule_id = p.rule_id and status = 'approved';
    if approved >= (r.approval ->> 'maxPerReservation')::int then
      raise exception 'limit reached for this reservation' using errcode = '23514';
    end if;
  end if;

  update public.goodwill_proposals
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_at = now(), decided_by = auth.uid(), note = nullif(left(trim(p_note), 500), '')
    where id = p.id;
  insert into public.audit_log (actor_id, action, resource, resource_id, outcome, metadata)
    values (auth.uid(), 'goodwill.decide', 'goodwill_proposal', p.id::text, 'success',
            jsonb_build_object('approve', p_approve, 'rule', p.rule_id, 'financial', p.financial));
end $$;

revoke execute on function public.decide_goodwill_proposal(uuid, boolean, text) from public, anon;
grant execute on function public.decide_goodwill_proposal(uuid, boolean, text) to authenticated;

grant select on public.service_recovery_events, public.recovery_notices, public.goodwill_rules, public.goodwill_policy, public.goodwill_proposals to authenticated;
grant insert, update, delete on public.goodwill_rules to authenticated;
grant update on public.goodwill_policy to authenticated;

-- ─── Self-check: nothing in public left without RLS ───────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'RLS is not enabled on public.%', r.relname;
  end loop;
end $$;
