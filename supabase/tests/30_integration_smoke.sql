-- Supabase integration smoke test: every row should print "|t".
-- Run on a fresh database after 00_local_stubs.sql, all migrations and seed.sql.
\set ON_ERROR_STOP 0

-- ─── Authentication: linking a confirmed account to its guest ─────────────
-- Unconfirmed address: not linked yet.
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-00000000000a', 'Alexander.Laurent@example.com');
select 'unconfirmed account is not linked' t, auth_user_id is null ok from guests where first_name = 'Alexander';
-- Confirmation links it (case-insensitive match) and grants the guest role.
update auth.users set email_confirmed_at = now() where id = 'a0000000-0000-0000-0000-00000000000a';
select 'confirmed account is linked' t, auth_user_id = 'a0000000-0000-0000-0000-00000000000a' ok from guests where first_name = 'Alexander';
select 'lead guest gets the guest role' t, array_agg(role) = '{guest}' ok from user_roles where user_id = 'a0000000-0000-0000-0000-00000000000a';
-- The companion is linked as a travel companion.
insert into auth.users (id, email, email_confirmed_at) values ('a0000000-0000-0000-0000-00000000000c', 'camille.laurent@example.com', now());
select 'companion gets travel_companion role' t, array_agg(role) = '{travel_companion}' ok from user_roles where user_id = 'a0000000-0000-0000-0000-00000000000c';
-- A second account with the same e-mail cannot take over the guest.
insert into auth.users (id, email, email_confirmed_at) values ('a0000000-0000-0000-0000-0000000000ff', 'alexander.laurent@example.com', now());
select 'second account is not linked' t, count(*) = 0 ok from user_roles where user_id = 'a0000000-0000-0000-0000-0000000000ff';
select 'link refusal is audited' t, count(*) = 1 ok from audit_log where action = 'auth.link' and outcome = 'failure' and metadata ->> 'reason' = 'already_linked';
-- An unknown address gets nothing.
insert into auth.users (id, email, email_confirmed_at) values ('a0000000-0000-0000-0000-00000000000b', 'someone.else@example.com', now());
select 'unknown address has no role' t, count(*) = 0 ok from user_roles where user_id = 'a0000000-0000-0000-0000-00000000000b';

-- ─── Local-time views reproduce the port-local ISO strings ─────────────────
select 'booking start in port time' t, start_local = '2027-05-15T20:30:00+02:00' ok from experience_bookings_local where title = 'Dinner at Mediterraneo' and start_local like '2027-05-15%';
select 'flight departs in Miami time' t, departure = '2027-05-14T18:40:00-04:00' and arrival = '2027-05-15T09:10:00+02:00' ok from flight_segments_local where flight_number = 'AA 7412';
select 'midnight sailing keeps its date' t, departure = '2027-05-21T00:00:00+02:00' ok from port_calls_local where day = 6;
select 'embarkation window in port time' t, arrival_window_start = '2027-05-15T13:30:00+02:00' ok from embarkations_local;
select 'iso_local handles UTC and negative offsets' t,
  iso_local('2027-01-01T12:00:00Z', 'UTC') = '2027-01-01T12:00:00+00:00'
  and iso_local('2027-01-01T12:00:00Z', 'America/New_York') = '2027-01-01T07:00:00-05:00'
  and iso_local('2027-01-01T12:00:00Z', 'Asia/Kolkata') = '2027-01-01T17:30:00+05:30'
  and iso_local(null, 'UTC') is null ok;

-- ─── Guest A (Alexander) ───────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000a', false);
select 'A sees 4 reservations (current + 3 past)' t, count(*) = 4 ok from reservations;
select 'A sees 18 bookings' t, count(*) = 18 ok from experience_bookings_local;
select 'A sees own notifications' t, count(*) = 11 ok from notifications_local;
select 'A sees flights' t, count(*) = 2 ok from flight_segments_local;
select 'lead guest sees party documents' t, count(*) = 6 ok from travel_documents;
select 'A sees privileges' t, count(*) = 7 ok from guest_privileges;
select 'A sees dining details' t, count(*) > 0 ok from dining_bookings;
select 'A sees voyage guests' t, count(*) = 8 ok from voyage_guests;
select 'A sees own nationality only' t, nationality = 'American' ok from my_personal_details();
select 'A sees yachts sailed' t, yachts_sailed = '{Evrima,Ilma}' ok from my_relationship();
select 'A cannot reach the private schema' t, not has_schema_privilege('private', 'usage') ok;

-- Booking requests: allowed as a request, stamped server-side.
insert into experience_bookings (id, reservation_id, experience_id, starts_at, party_size, status, created_by, category, title)
select 'b0000000-0000-0000-0000-000000000001', r.id, e.id, '2027-05-17T15:00:00+02:00', 2, 'received', '00000000-0000-0000-0000-000000000bad', 'spa', null
from reservations r, experiences e where r.status <> 'completed' and e.title like 'Barolo%';
select 'request inserted with catalogue category and title' t, category = 'wine' and title like 'Barolo%' ok from experience_bookings where id = 'b0000000-0000-0000-0000-000000000001';
select 'created_by stamped from the session' t, created_by = 'a0000000-0000-0000-0000-00000000000a' and updated_by = 'a0000000-0000-0000-0000-00000000000a' ok from experience_bookings where id = 'b0000000-0000-0000-0000-000000000001';
select 'time zone defaulted from the voyage' t, start_local = '2027-05-17T15:00:00+02:00' ok from experience_bookings_local where id = 'b0000000-0000-0000-0000-000000000001';
-- Not allowed: a confirmed booking, or spoofed provenance.
do $$ begin
  insert into experience_bookings (reservation_id, experience_id, starts_at, party_size, status)
  select r.id, e.id, now(), 2, 'confirmed' from reservations r, experiences e where r.status <> 'completed' limit 1;
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'confirmed booking refused';
end $$;
do $$ begin
  insert into experience_bookings (reservation_id, experience_id, starts_at, party_size, source_system, external_id)
  select r.id, e.id, now(), 2, 'reservations-pms', 'PMS-1' from reservations r, experiences e where r.status <> 'completed' limit 1;
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'spoofed provenance refused';
end $$;
-- Direct updates are refused; the RPCs allow change requests and cancellation.
update experience_bookings set status = 'confirmed' where id = 'b0000000-0000-0000-0000-000000000001';
select 'direct update changes nothing' t, status = 'received' ok from experience_bookings where id = 'b0000000-0000-0000-0000-000000000001';
select request_experience_booking_change('b0000000-0000-0000-0000-000000000001', null, 3, 'Window seats, please');
select 'change request applied' t, status = 'in_progress' and party_size = 3 ok from experience_bookings where id = 'b0000000-0000-0000-0000-000000000001';
select cancel_experience_booking('b0000000-0000-0000-0000-000000000001');
select 'cancelled' t, status = 'cancelled' ok from experience_bookings where id = 'b0000000-0000-0000-0000-000000000001';
do $$ begin
  perform cancel_experience_booking('b0000000-0000-0000-0000-000000000001');
  raise notice 'NOT REFUSED';
exception when invalid_parameter_value then raise notice 'second cancel refused';
end $$;

-- Notifications: may mark read, may not rewrite.
update notifications set read_at = now() where title = 'Your health questionnaire';
select 'notification marked read' t, read_at is not null ok from notifications where title = 'Your health questionnaire';
do $$ begin
  update notifications set title = 'Changed' where title = 'Your health questionnaire';
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'notification rewrite refused';
end $$;
do $$ begin
  insert into notifications (guest_id, channel, category, title, body, scheduled_for) select id, 'push', 'concierge', 'x', 'y', now() from guests limit 1;
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'notification insert refused';
end $$;

-- Service requests: guests raise them unassigned.
insert into service_requests (reservation_id, type, summary, created_by)
select id, 'general', 'Extra pillows', auth.uid() from reservations where status <> 'completed';
select 'service request raised' t, count(*) = 1 ok from service_requests where summary = 'Extra pillows';
do $$ begin
  insert into service_requests (reservation_id, type, summary, created_by, assigned_to_name)
  select id, 'general', 'Spoof', auth.uid(), 'Captain' from reservations where status <> 'completed';
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'self-assigned request refused';
end $$;
-- Reference data is read-only.
do $$ begin
  update experience_slots set remaining = 99;
  raise notice 'NOT REFUSED';
exception when insufficient_privilege then raise notice 'reference data update refused';
end $$;
select 'external routes are rejected' t, not exists (select 1 from notifications where deep_link like '//%') ok;
reset role;

-- ─── Guest B: a different guest sees none of A's data ──────────────────────
insert into guests (id, salutation, first_name, last_name, email_masked, auth_user_id) values
  ('c0000000-0000-0000-0000-00000000000b', 'Ms', 'Other', 'Guest', 'o***', 'a0000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000b', false);
select 'B sees no reservations' t, count(*) = 0 ok from reservations;
select 'B sees no bookings' t, count(*) = 0 ok from experience_bookings_local;
select 'B sees no notifications' t, count(*) = 0 ok from notifications;
select 'B sees no flights' t, count(*) = 0 ok from flight_segments;
select 'B sees no booking details' t, (select count(*) from dining_bookings) + (select count(*) from spa_bookings) + (select count(*) from excursion_bookings) = 0 ok;
select 'B sees no occasions' t, count(*) = 0 ok from guest_occasions;
select 'B sees no privileges' t, count(*) = 0 ok from guest_privileges;
select 'B sees no conversations' t, count(*) = 0 ok from concierge_conversations;
select 'B relationship is empty' t, count(*) = 0 ok from my_relationship();
select 'B has no nationality' t, count(*) = 0 ok from my_personal_details();
do $$ begin
  perform cancel_experience_booking((select id from public.experience_bookings limit 1));
  raise notice 'NOT REFUSED';
exception when no_data_found then raise notice 'B cannot cancel A booking';
end $$;
select 'B can read the catalogue' t, count(*) = 28 ok from experiences;
reset role;

-- ─── anon reaches nothing ──────────────────────────────────────────────────
select 'anon has no table access' t, not exists (
  select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public') ok;
select 'anon cannot run functions' t, not has_function_privilege('anon', 'public.cancel_experience_booking(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.my_relationship()', 'execute') ok;

-- ─── Audit ─────────────────────────────────────────────────────────────────
select 'booking changes audited without values' t, count(*) >= 3 and bool_and(not (metadata::text like '%Window seats%')) ok
  from audit_log where resource = 'experience_bookings' and actor_id = 'a0000000-0000-0000-0000-00000000000a';
select 'cancel audit lists changed columns' t, metadata -> 'columns' ? 'status' ok
  from audit_log where action = 'experience_bookings.update' and metadata ->> 'status' = 'cancelled';
select 'every public table has RLS' t, not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) ok;
