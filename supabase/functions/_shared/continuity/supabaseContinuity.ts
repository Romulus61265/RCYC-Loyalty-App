// Continuity's ports over Supabase (service role).
//
// No transfer supplier, venue, PMS or flight-status integration exists, so
// each change is recorded as a task for the team that owns it and reported
// to the guest as "requested". The flight's new estimate is recorded on
// flight_segments; the events go to journey_events, correlated.
import type { ContinuityPorts } from './orchestrator.ts';
import type { ArrivalContext, ArrivalUpdate, FlightStatusUpdate } from './types.ts';

// deno-lint-ignore no-explicit-any
type Query = any;
export interface Db {
  from(table: string): Query;
}

type Result = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
async function rows<T>(q: Result): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
async function row<T>(q: Result): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

const same = (a: string, b: string) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

interface FlightRow {
  id: string;
  reservation_id: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  tracked_for_transfer: boolean;
}

async function contextFor(db: Db, f: FlightRow, now: Date): Promise<ArrivalContext | null> {
  const res = await row<{ id: string; lead_guest_id: string; suite_ambassador: string | null; suite_ambassador_contact: { name?: string; title?: string } | null; suite: { name: string; number: string } | null }>(
    db.from('reservations').select('id, lead_guest_id, suite_ambassador, suite_ambassador_contact, suite:suites(name, number)').eq('id', f.reservation_id).maybeSingle(),
  );
  if (!res) return null;
  const [guest, membership, bookings, embark] = await Promise.all([
    row<{ first_name: string; preferred_name: string | null }>(db.from('guests').select('first_name, preferred_name').eq('id', res.lead_guest_id).maybeSingle()),
    row<{ tier_label: string }>(db.from('loyalty_memberships').select('tier_label').eq('guest_id', res.lead_guest_id).maybeSingle()),
    rows<{ id: string; category: string; title: string; venue: string | null; start_local: string; end_local: string | null; status: string }>(
      db.from('experience_bookings_local').select('id, category, title, venue, start_local, end_local, status').eq('reservation_id', f.reservation_id).order('starts_at'),
    ),
    row<{ terminal_name: string; arrival_window_start: string; arrival_window_end: string; suite_ready_at: string; all_aboard: string; luggage: { deliveredBy?: string } | null }>(
      db.from('embarkations_local').select('terminal_name, arrival_window_start, arrival_window_end, suite_ready_at, all_aboard, luggage').eq('reservation_id', f.reservation_id).maybeSingle(),
    ),
  ]);
  if (!embark) return null;
  const day = f.arrival.slice(0, 10);
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined');
  const transfer = live.find((b) => b.category === 'transfer' && b.start_local.slice(0, 10) === day && Date.parse(b.start_local) >= Date.parse(f.arrival) - 3_600_000);
  const enRoute = transfer?.end_local
    ? live.filter((b) => b.id !== transfer.id && Date.parse(b.start_local) >= Date.parse(transfer.start_local) && Date.parse(b.start_local) < Date.parse(transfer.end_local!))
    : [];
  const name = res.suite_ambassador_contact?.name ?? res.suite_ambassador ?? 'Your Suite Ambassador';
  return {
    now: now.toISOString(),
    reservationId: f.reservation_id,
    guest: { firstName: guest?.preferred_name ?? guest?.first_name ?? 'Guest', ...(membership ? { tier: membership.tier_label } : {}), ...(res.suite ? { suiteName: `${res.suite.name} ${res.suite.number}` } : {}) },
    ambassador: { firstName: name.split(' ')[0] ?? name, title: res.suite_ambassador_contact?.title ?? 'Suite Ambassador' },
    flight: { id: f.id, flightNumber: f.flight_number, origin: f.origin, destination: f.destination, scheduledArrival: f.arrival, trackedForTransfer: f.tracked_for_transfer },
    ...(transfer ? { transfer: { bookingId: transfer.id, title: transfer.title, venue: transfer.venue ?? '', start: transfer.start_local, ...(transfer.end_local ? { end: transfer.end_local } : {}) } } : {}),
    enRoute: enRoute.map((b) => ({ bookingId: b.id, title: b.title, start: b.start_local, ...(b.end_local ? { end: b.end_local } : {}) })),
    embarkation: {
      terminalName: embark.terminal_name,
      windowStart: embark.arrival_window_start,
      windowEnd: embark.arrival_window_end,
      suiteReadyAt: embark.suite_ready_at,
      allAboard: embark.all_aboard,
      ...(embark.luggage?.deliveredBy ? { luggageDeliveredBy: embark.luggage.deliveredBy } : {}),
    },
  };
}

export function supabaseContinuityPorts(db: Db): ContinuityPorts {
  const task = async (planKey: string, reservationId: string, team: 'transfer' | 'venue' | 'embarkation' | 'crew', action: object, index: string) => {
    const { error } = await db.from('continuity_tasks').insert({ task_key: `${planKey}:${team}:${index}`, plan_key: planKey, reservation_id: reservationId, team, action });
    if (error && error.code !== '23505') throw new Error(error.message);
  };
  // The plan key a context is being handled under (set by contexts → find, read by the team ports).
  const keys = new Map<string, string>();
  return {
    async find(key) {
      const found = await row<{ id: string; update: Omit<ArrivalUpdate, 'id'> }>(db.from('arrival_updates').select('id, update').eq('plan_key', key).maybeSingle());
      return found ? { ...found.update, id: found.id } : null;
    },
    async contexts(update: FlightStatusUpdate, now: Date) {
      const flights = await rows<FlightRow>(
        db.from('flight_segments_local').select('id, reservation_id, flight_number, origin, destination, departure, arrival, tracked_for_transfer').eq('direction', 'inbound'),
      );
      const out: ArrivalContext[] = [];
      for (const f of flights.filter((x) => same(x.flight_number, update.flightNumber) && x.departure.slice(0, 10) === update.departureDate)) {
        // Our own record of the flight learns the new estimate.
        if (update.status === 'delayed' || update.status === 'cancelled') {
          const { error } = await db.from('flight_segments').update({ status: update.status, estimated_arrival: update.estimatedArrival ?? null }).eq('id', f.id);
          if (error) throw new Error(error.message);
        }
        const ctx = await contextFor(db, f, now);
        if (ctx) {
          keys.set(ctx.reservationId, `arrival:${f.id}:${update.estimatedArrival ?? update.status}`);
          out.push(ctx);
        }
      }
      return out;
    },
    transfer: {
      retime: async (a, ctx) => {
        await task(keys.get(ctx.reservationId) ?? '', ctx.reservationId, 'transfer', a, a.bookingId);
        return 'requested';
      },
    },
    experiences: {
      requestChange: async (a, ctx) => {
        await task(keys.get(ctx.reservationId) ?? '', ctx.reservationId, 'venue', a, a.bookingId);
        return 'requested';
      },
    },
    embarkation: {
      notify: async (a, ctx) => {
        await task(keys.get(ctx.reservationId) ?? '', ctx.reservationId, 'embarkation', a, 'window');
        // A task in a queue no one is known to be watching is not a notification.
        return 'requested';
      },
    },
    crew: {
      alert: async (a, ctx) => {
        await task(keys.get(ctx.reservationId) ?? '', ctx.reservationId, 'crew', a, a.reason);
        return 'requested';
      },
    },
    async publish(events) {
      for (const e of events) {
        const { error } = await db.from('journey_events').insert({
          type: e.type,
          reservation_id: e.reservationId,
          severity: e.severity,
          source: e.source,
          payload: { ...e.payload, correlationId: e.correlationId, causationId: e.causationId },
          dedupe_key: e.dedupeKey,
          occurred_at: e.occurredAt,
          processed_at: new Date().toISOString(),
        });
        if (error && error.code !== '23505') throw new Error(error.message);
      }
    },
    async save(update) {
      const { data, error } = await db.from('arrival_updates').insert({ reservation_id: update.reservationId, plan_key: update.key, update, simulated: update.simulated }).select('id').single();
      if (error) throw new Error(error.message);
      return { ...update, id: data.id };
    },
    async audit(entry) {
      await db.from('audit_log').insert({ action: entry.action, resource: 'arrival_update', resource_id: entry.resourceId ?? null, outcome: entry.outcome, metadata: entry.metadata });
    },
  };
}
