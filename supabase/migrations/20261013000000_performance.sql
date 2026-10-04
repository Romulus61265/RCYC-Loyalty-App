-- Performance (docs/21).
--
-- The one foreign key the app filters by that had no index: crew read
-- reflections by reservation, and the read policy checks it per row
-- (crew_for_reservation(reservation_id)). Every other reservation_id key
-- was already indexed; the remaining unindexed keys are audit columns
-- (created_by, decided_by, …) that no query filters on, listed in
-- supabase/tests/40_index_audit.sql.
create index if not exists voyage_feedback_reservation_id_idx on public.voyage_feedback (reservation_id);
