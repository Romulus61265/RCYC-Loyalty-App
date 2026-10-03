-- Preferences v2 smoke test: every row should print "|t". Run after both
-- migrations and 10_rls_smoke.sql (which seeds guests A and B and crew C).
\set ON_ERROR_STOP 0
set role authenticated;

-- Guest A saves preferences for the first time (version 1).
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into guest_preferences(guest_id, dining, accessibility, privacy, version)
values ('10000000-0000-0000-0000-00000000000a', '{"tablePreference":"window"}', '{"shareWithCrew":true}', '{"analytics":false}', 1);
select 'A reads own prefs' t, count(*) = 1 ok from guest_preferences;

-- Optimistic concurrency: next version succeeds, a skipped version is refused.
update guest_preferences set dining = '{"tablePreference":"terrace"}', version = 2 where guest_id = '10000000-0000-0000-0000-00000000000a' and version = 1;
select 'A update to v2 applied' t, version = 2 and dining->>'tablePreference' = 'terrace' ok from guest_preferences;
update guest_preferences set dining = '{}', version = 2 where guest_id = '10000000-0000-0000-0000-00000000000a' and version = 1;
select 'stale update (expects v1) changes nothing' t, dining->>'tablePreference' = 'terrace' ok from guest_preferences;
do $$ begin
  update guest_preferences set version = 5 where guest_id = '10000000-0000-0000-0000-00000000000a';
  raise notice 'NOT REFUSED';
exception when sqlstate '40001' then raise notice 'version jump refused';
end $$;

-- Another guest can neither read nor write A's preferences.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select 'B cannot read A prefs' t, count(*) = 0 ok from guest_preferences;
do $$ begin
  insert into guest_preferences(guest_id, version) values ('10000000-0000-0000-0000-00000000000a', 1);
  raise notice 'NOT REFUSED';
exception when others then raise notice 'B insert for A refused';
end $$;

-- Crew see preferences only while the guest consents.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select 'crew sees consented prefs' t, count(*) = 1 ok from guest_preferences;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
update guest_preferences set accessibility = '{"shareWithCrew":false}', version = 3 where guest_id = '10000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select 'crew loses access when consent withdrawn' t, count(*) = 0 ok from guest_preferences;

reset role;
select 'every save audited, groups only' t, count(*) = 3 and bool_and(metadata ? 'groups') and bool_and(not (metadata::text ilike '%terrace%')) ok
  from audit_log where action like 'preferences.%';
select 'audit lists the changed group' t, metadata->'groups' = '["accessibility"]'::jsonb ok
  from audit_log where action = 'preferences.update' and (metadata->>'version')::int = 3;
