-- Scale probe (optional: SCALE_PROBE=1 npm run test:supabase).
-- Another guest's voyage carrying fleet-scale volume (200k messages and
-- notifications, 100k requests and bookings); then the guest's own app
-- queries, as the guest, through RLS. Prints each query's execution time.
\set QUIET on
insert into public.guests (id, salutation, first_name, last_name, email_masked, source_system)
  values ('c0000000-0000-0000-0000-0000000000e1', 'Mr', 'Scale', 'Guest', 's•••@example.com', 'mock');
insert into public.reservations (id, booking_reference, voyage_id, lead_guest_id)
  select 'd0000000-0000-0000-0000-0000000000e1', 'SCALE-1', voyage_id, 'c0000000-0000-0000-0000-0000000000e1' from public.reservations limit 1;
insert into public.concierge_conversations (id, reservation_id, guest_id)
  values ('e0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1');
insert into public.concierge_messages (conversation_id, author, body, created_at)
  select 'e0000000-0000-0000-0000-0000000000e1', 'guest', 'A message', now() - g * interval '1 minute' from generate_series(1, 200000) g;
insert into public.notifications (guest_id, reservation_id, channel, category, title, body, scheduled_for)
  select 'c0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000e1', 'in-app', 'onboard', 'T', 'B', now() - g * interval '1 minute' from generate_series(1, 200000) g;
insert into public.service_requests (reservation_id, guest_id, type, category, summary)
  select 'd0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-0000000000e1', 'general', 'concierge', 'S' from generate_series(1, 100000) g;
insert into public.experience_bookings (reservation_id, experience_id, starts_at, party_size)
  select 'd0000000-0000-0000-0000-0000000000e1', (select id from public.experiences limit 1), now() + g * interval '1 hour', 2 from generate_series(1, 100000) g;
insert into public.reservations (booking_reference, voyage_id, lead_guest_id)
  select 'SCALE-R' || g, (select voyage_id from public.reservations limit 1), 'c0000000-0000-0000-0000-0000000000e1' from generate_series(1, 20000) g;
insert into public.reservation_guests (reservation_id, guest_id)
  select id, lead_guest_id from public.reservations where booking_reference like 'SCALE-R%';
analyze;

-- The guest: Alexander, signed in.
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-0000000000f1', 'scale.probe@example.com') on conflict do nothing;
update public.guests set auth_user_id = coalesce(auth_user_id, 'b0000000-0000-0000-0000-0000000000f1') where first_name = 'Alexander';
select set_config('probe.uid', (select auth_user_id::text from public.guests where first_name = 'Alexander'), false);
select set_config('probe.res', (select r.id::text from public.reservations r join public.guests g on g.id = r.lead_guest_id where g.first_name = 'Alexander' limit 1), false);
select set_config('probe.conv', coalesce((select c.id::text from public.concierge_conversations c where c.reservation_id = current_setting('probe.res')::uuid limit 1), '00000000-0000-0000-0000-000000000000'), false);
grant usage on schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('probe.uid'), 'role', 'authenticated')::text, false);

create temporary table probe (query text, ms numeric, rows bigint);
create or replace function pg_temp.time_it(label text, q text) returns void language plpgsql as $$
declare plan json; begin
  execute 'explain (analyze, format json) ' || q into plan;
  update probe set ms = round((plan->0->>'Execution Time')::numeric, 2), rows = (plan->0->'Plan'->>'Actual Rows')::bigint where query = label;
end $$;
-- Each query is cancelled after 15 s (the timeout starts with each top-level statement); it keeps a row with no time.
\set ON_ERROR_STOP off
set statement_timeout = '15s';
insert into probe values ('concierge thread', null, null);
select pg_temp.time_it('concierge thread', format('select * from public.concierge_messages where conversation_id = %L order by created_at', current_setting('probe.conv')));
insert into probe values ('notifications', null, null);
select pg_temp.time_it('notifications', format('select * from public.notifications_local where reservation_id = %L', current_setting('probe.res')));
insert into probe values ('service requests', null, null);
select pg_temp.time_it('service requests', format('select * from public.service_requests_local where reservation_id = %L', current_setting('probe.res')));
insert into probe values ('bookings', null, null);
select pg_temp.time_it('bookings', format('select * from public.experience_bookings_local where reservation_id = %L', current_setting('probe.res')));
insert into probe values ('all my notifications (no filter)', null, null);
select pg_temp.time_it('all my notifications (no filter)', 'select id from public.notifications');
insert into probe values ('all my requests (no filter)', null, null);
select pg_temp.time_it('all my requests (no filter)', 'select id from public.service_requests');
insert into probe values ('my reservations: all, RLS filters', null, null);
select pg_temp.time_it('my reservations: all, RLS filters', 'select id from public.reservations');
insert into probe values ('my reservations: by party', null, null);
select pg_temp.time_it('my reservations: by party', format('select r.id from public.reservations r where exists (select 1 from public.reservation_guests rg where rg.reservation_id = r.id and rg.guest_id = %L)', (select id from public.guests where first_name = 'Alexander')));
reset statement_timeout;
select format('scale probe | %-38s %s', query, coalesce(ms || ' ms, ' || rows || ' rows', 'did not finish in 15 s')) from probe;
