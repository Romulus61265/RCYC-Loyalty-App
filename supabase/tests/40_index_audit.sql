-- Index audit: every foreign key in public has an index that starts with
-- its columns. Postgres does not create these; without them, RLS checks
-- that join through a reservation or guest, and every "rows of this
-- reservation" query, scan the whole table as data grows.
-- One row per foreign key: name | t (indexed, or an audit column that no
-- query filters on, listed below) or f (missing).
select format('fk indexed: %s.%s(%s)', c.conrelid::regclass, c.conname, string_agg(a.attname, ',' order by k.ord)) as check,
       c.conname in (
         -- Who did it: written for the record, never filtered on.
         'concierge_ai_runs_actor_user_id_fkey', 'concierge_conversations_assigned_agent_fkey', 'concierge_messages_author_user_id_fkey',
         'continuity_tasks_done_by_fkey', 'experience_bookings_created_by_fkey', 'goodwill_policy_updated_by_fkey',
         'goodwill_proposals_decided_by_fkey', 'push_devices_user_id_fkey', 'service_recovery_events_resolved_by_fkey',
         'service_request_events_actor_fkey', 'service_requests_assigned_to_fkey', 'service_requests_created_by_fkey',
         'user_roles_granted_by_fkey'
       ) or exists (
         select 1 from pg_index i
         where i.indrelid = c.conrelid
           and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey
       ) as ok
from pg_constraint c
join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
group by c.conrelid, c.conname, c.conkey
order by 1;
