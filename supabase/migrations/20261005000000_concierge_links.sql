-- ═══════════════════════════════════════════════════════════════════════════
-- Concierge: link a service request to the experience or booking it is about,
-- so the concierge can show its status on the right card ("Bridge visit:
-- choose a time") and crew see the context.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.service_requests
  add column if not exists experience_id uuid references public.experiences(id) on delete set null,
  add column if not exists booking_id    uuid references public.experience_bookings(id) on delete set null;

create index on public.service_requests (experience_id);
create index on public.service_requests (booking_id);

-- New columns go at the end so the view can be replaced in place.
create or replace view public.service_requests_local with (security_invoker = true) as
  select s.id, s.reservation_id, s.conversation_id, s.type, s.summary, s.details, s.status, s.priority,
         s.assigned_team, s.assigned_to_name,
         public.iso_local(s.created_at, s.time_zone)     as created_at,
         public.iso_local(s.updated_at, s.time_zone)     as updated_at,
         public.iso_local(s.next_update_by, s.time_zone) as next_update_by,
         s.created_at as created_ts,
         s.experience_id, s.booking_id
  from public.service_requests s;

-- Guests may link only a booking on the same reservation, or an active
-- experience on that voyage.
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
    and (booking_id is null or exists (
      select 1 from public.experience_bookings b where b.id = booking_id and b.reservation_id = service_requests.reservation_id))
    and (experience_id is null or exists (
      select 1 from public.experiences e join public.reservations r on r.id = service_requests.reservation_id
      where e.id = experience_id and e.active and (e.voyage_id is null or e.voyage_id = r.voyage_id)))
  );
