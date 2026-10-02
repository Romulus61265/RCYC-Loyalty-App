-- RLS smoke test: every row should print "|t". Run after the migration.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into guests(id,auth_user_id,salutation,first_name,last_name,email_masked) values
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Mrs','Isabelle','LH','i***'),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','Mr','Other','G','o***');
insert into yachts(id,name) values ('20000000-0000-0000-0000-000000000001','Aurelia');
insert into voyages(id,code,name,yacht_id,start_date,end_date) values ('30000000-0000-0000-0000-000000000001','AU1','Riviera','20000000-0000-0000-0000-000000000001','2026-10-17','2026-10-24');
insert into reservations(id,booking_reference,voyage_id,lead_guest_id) values ('40000000-0000-0000-0000-000000000001','AU-1','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a');
insert into reservation_guests values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-00000000000a');
insert into guest_relationships(guest_id,voyages_completed,value_segment) values ('10000000-0000-0000-0000-00000000000a',2,'distinguished');
insert into user_roles(user_id,role,yacht_id) values ('00000000-0000-0000-0000-00000000000c','suite_ambassador','20000000-0000-0000-0000-000000000001');
insert into recommendations(guest_id,surface,kind,title,rationale,score,audience,model_version) values
 ('10000000-0000-0000-0000-00000000000a','home','experience','Guest rec','r',0.9,'guest','v0'),
 ('10000000-0000-0000-0000-00000000000a','crew-console','service-gesture','Crew rec','r',0.7,'crew','v0');
insert into audit_log(action,resource,outcome) values ('test','x','success');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select 'A sees own reservation' t, count(*) = 1 ok from reservations;
select 'A cannot read relationships table' t, count(*) = 0 ok from guest_relationships;
select 'A gets safe relationship fn' t, voyages_completed = 2 ok from my_relationship();
select 'A sees only guest recs' t, count(*) = 1 ok from recommendations;
select 'A cannot read audit' t, count(*) = 0 ok from audit_log;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select 'B cannot see A reservation' t, count(*) = 0 ok from reservations;
select 'B sees only self in guests' t, count(*) = 1 ok from guests;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select 'Crew sees reservation on own yacht' t, count(*) = 1 ok from reservations;
select 'Crew sees guest A' t, count(*) = 1 ok from guests;
select 'Crew sees crew rec' t, count(*) = 2 ok from recommendations;
reset role;
select 'pii schema hidden from authenticated' t, not has_schema_privilege('authenticated','private','USAGE') ok;
update audit_log set action='tamper';
