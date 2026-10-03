-- ═══════════════════════════════════════════════════════════════════════════
-- Guest service requests: categories, the guest-facing lifecycle, resolution
-- notes, who raised it, and the occasion step a request came from.
--
--  • category: suite, dining, housekeeping, maintenance, transportation,
--    excursion, spa, concierge, special-assistance, other. Older requests are
--    backfilled from `type`; new ones without a category get it from `type`.
--  • The five guest-facing statuses (Submitted, Acknowledged, In progress,
--    Resolved, Closed) map onto request_status plus lifecycle stamps, which a
--    trigger sets on every change, so crew tools need only set the status.
--  • Guests insert new requests only (as before), and may close them only
--    through close_service_request(): withdraw before work starts, or close
--    once resolved. Status, assignment and notes stay with the crew.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.service_requests
  add column if not exists category         text,
  add column if not exists guest_id         uuid references public.guests(id) on delete set null,
  add column if not exists resolution_notes text,
  add column if not exists acknowledged_at  timestamptz,
  add column if not exists started_at       timestamptz,
  add column if not exists resolved_at      timestamptz,
  add column if not exists closed_at        timestamptz,
  add column if not exists occasion_step    text;

create or replace function public.request_category_for(t text) returns text
language sql immutable set search_path = '' as $$
  select case t
    when 'dining-change' then 'dining'
    when 'transport'     then 'transportation'
    when 'suite'         then 'suite'
    when 'excursion'     then 'excursion'
    when 'medical'       then 'special-assistance'
    else 'concierge'
  end
$$;

update public.service_requests set category = public.request_category_for(type) where category is null;

alter table public.service_requests
  alter column category set not null,
  add constraint service_requests_category_check check (category in
    ('suite', 'dining', 'housekeeping', 'maintenance', 'transportation', 'excursion', 'spa', 'concierge', 'special-assistance', 'other')),
  add constraint service_requests_resolution_length check (resolution_notes is null or char_length(resolution_notes) <= 2000),
  add constraint service_requests_occasion_step_length check (occasion_step is null or char_length(occasion_step) <= 120);

create index on public.service_requests (guest_id);
create index on public.service_requests (reservation_id, occasion_step) where occasion_step is not null;

-- Defaults on insert, lifecycle stamps on update.
create or replace function public.service_request_lifecycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.category := coalesce(new.category, public.request_category_for(new.type));
    new.guest_id := coalesce(new.guest_id, public.current_guest_id());
    return new;
  end if;
  if new.assigned_to_name is not null and old.assigned_to_name is null then
    new.acknowledged_at := coalesce(new.acknowledged_at, now());
  end if;
  if new.status is distinct from old.status then
    -- Withdrawn or declined straight away is not an acknowledgement.
    if old.status = 'received' and new.status not in ('cancelled', 'declined') then new.acknowledged_at := coalesce(new.acknowledged_at, now()); end if;
    if new.status in ('in_progress', 'awaiting_guest') then new.started_at := coalesce(new.started_at, now()); end if;
    if new.status in ('completed', 'confirmed') then new.resolved_at := coalesce(new.resolved_at, now()); end if;
    if new.status in ('cancelled', 'declined') then new.closed_at := coalesce(new.closed_at, now()); end if;
  end if;
  return new;
end $$;

create trigger service_request_lifecycle before insert or update on public.service_requests
  for each row execute function public.service_request_lifecycle();

-- New columns go at the end so the view can be replaced in place.
create or replace view public.service_requests_local with (security_invoker = true) as
  select s.id, s.reservation_id, s.conversation_id, s.type, s.summary, s.details, s.status, s.priority,
         s.assigned_team, s.assigned_to_name,
         public.iso_local(s.created_at, s.time_zone)     as created_at,
         public.iso_local(s.updated_at, s.time_zone)     as updated_at,
         public.iso_local(s.next_update_by, s.time_zone) as next_update_by,
         s.created_at as created_ts,
         s.experience_id, s.booking_id,
         s.category, s.guest_id, s.resolution_notes,
         public.iso_local(s.acknowledged_at, s.time_zone) as acknowledged_at,
         public.iso_local(s.started_at, s.time_zone)      as started_at,
         public.iso_local(s.resolved_at, s.time_zone)     as resolved_at,
         public.iso_local(s.closed_at, s.time_zone)       as closed_at,
         s.occasion_step
  from public.service_requests s;

-- Guests create requests in their opening state only.
drop policy if exists "party create" on public.service_requests;
create policy "party create" on public.service_requests for insert to authenticated
  with check (
    public.on_reservation(reservation_id)
    and status = 'received'
    and created_by = auth.uid()
    and assigned_to is null and assigned_to_name is null and next_update_by is null
    and resolution_notes is null and acknowledged_at is null and started_at is null and resolved_at is null and closed_at is null
    and (guest_id is null or guest_id = public.current_guest_id())
    and (conversation_id is null or exists (
      select 1 from public.concierge_conversations c
      where c.id = conversation_id and c.reservation_id = service_requests.reservation_id and c.guest_id = public.current_guest_id()))
    and (booking_id is null or exists (
      select 1 from public.experience_bookings b where b.id = booking_id and b.reservation_id = service_requests.reservation_id))
    and (experience_id is null or exists (
      select 1 from public.experiences e join public.reservations r on r.id = service_requests.reservation_id
      where e.id = experience_id and e.active and (e.voyage_id is null or e.voyage_id = r.voyage_id)))
  );

/**
 * The only change a guest makes to a request: withdraw it before anyone has
 * started (it becomes cancelled), or close it once resolved. Anything else is
 * refused; the crew own status, assignment and notes.
 */
create or replace function public.close_service_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  select id, reservation_id, status, closed_at into r from public.service_requests where id = p_request for update;
  if not found or not public.on_reservation(r.reservation_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.closed_at is not null or r.status in ('cancelled', 'declined') then
    raise exception 'request already closed' using errcode = '22023';
  end if;
  if r.status = 'received' then
    update public.service_requests
      set status = 'cancelled', closed_at = now(), updated_at = now(), resolution_notes = coalesce(resolution_notes, 'Withdrawn by the guest.')
      where id = p_request;
  elsif r.status in ('completed', 'confirmed') then
    update public.service_requests set closed_at = now(), updated_at = now() where id = p_request;
  else
    raise exception 'request is in progress' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.close_service_request(uuid) from public, anon;
grant execute on function public.close_service_request(uuid) to authenticated;
revoke execute on function public.request_category_for(text) from public, anon;
grant execute on function public.request_category_for(text) to authenticated;
