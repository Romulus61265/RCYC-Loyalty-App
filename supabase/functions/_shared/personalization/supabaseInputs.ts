// Loads the engine's inputs from Supabase, server-side.
//
// Uses the service-role client, because history signals and the value
// segment are not readable by guests (RLS). The caller must already have
// been authorised for this guest and reservation under their own RLS (see
// personalization-next-best). The client type is structural, so this runs
// in Deno (the function) and in Node (scripts/supabase/integration.ts).
import type { HistoryItem, PersonalizationInput } from './types.ts';

// deno-lint-ignore no-explicit-any
type Query = any;
export interface Db {
  from(table: string): Query;
}

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;
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
async function paged<T>(page: (from: number, to: number) => Result): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const batch = await rows<T>(page(from, from + 499));
    out.push(...batch);
    if (batch.length < 500) return out;
  }
}

const HISTORY: Record<string, HistoryItem['kind']> = { 'dining-history': 'dining', 'spa-history': 'spa', 'excursion-history': 'excursion' };

export async function loadPersonalizationInput(db: Db, guestId: string, reservationId: string, today: string): Promise<PersonalizationInput | null> {
  const res = await row<{ id: string; voyage: { id: string; name: string; start_date: string; end_date: string; yacht: { name: string } | null } | null }>(
    db.from('reservations').select('id, voyage:voyages(id, name, start_date, end_date, yacht:yachts(name))').eq('id', reservationId).maybeSingle(),
  );
  if (!res?.voyage) return null;
  const voyageId = res.voyage.id;

  const [membership, relationship, past, ports, catalogue, bookings, prefs, companions, occasions, signals] = await Promise.all([
    row<{ tier: string }>(db.from('loyalty_memberships').select('tier').eq('guest_id', guestId).maybeSingle()),
    row<{ value_segment: string | null }>(db.from('guest_relationships').select('value_segment').eq('guest_id', guestId).maybeSingle()),
    rows<{ reservation: { id: string; status: string; voyage: { id: string; name: string; region: string | null; start_date: string; end_date: string } | null } | null }>(
      db.from('reservation_guests').select('reservation:reservations(id, status, voyage:voyages(id, name, region, start_date, end_date))').eq('guest_id', guestId),
    ),
    rows<{ id: string; day: number; call_date: string; type: string; port_name: string; country: string }>(db.from('port_calls_local').select('id, day, call_date, type, port_name, country').eq('voyage_id', voyageId).order('day')),
    rows<{ id: string; title: string; category: string; port_call_id: string | null; destination: string | null; duration_minutes: number | null; format: string; private_available: boolean; tags: string[] | null; availability_status: string | null }>(
      db.from('experiences').select('id, title, category, port_call_id, destination, duration_minutes, format, private_available, tags, availability_status').or(`voyage_id.eq.${voyageId},voyage_id.is.null`).eq('active', true).order('sort_order'),
    ),
    paged<{ id: string; experience_id: string; category: string; start_local: string; end_local: string | null; status: string }>((f, t) =>
      db.from('experience_bookings_local').select('id, experience_id, category, start_local, end_local, status').eq('reservation_id', reservationId).order('starts_at').order('id').range(f, t),
    ),
    // deno-lint-ignore no-explicit-any
    row<Record<string, any>>(db.from('guest_preferences').select('preferred_destinations, dining, beverage, spa, excursions, accessibility, activity_interests, privacy').eq('guest_id', guestId).maybeSingle()),
    rows<{ first_name: string; relationship: string; is_minor: boolean; notes: string | null }>(db.from('travel_companions').select('first_name, relationship, is_minor, notes').eq('guest_id', guestId)),
    rows<{ id: string; type: string; label: string; occasion_date: string; recognition: 'celebrate' | 'discreet' | 'private' }>(db.from('guest_occasions').select('id, type, label, occasion_date, recognition').eq('guest_id', guestId)),
    rows<{ kind: string; weight: number; value: { ref?: string; summary?: string; memory?: string; category?: string; voyageId?: string; rating?: number; tags?: string[] } }>(
      db.from('personalization_signals').select('kind, weight, value').eq('guest_id', guestId),
    ),
  ]);

  const ids = catalogue.map((e) => e.id);
  const slots = ids.length
    ? await paged<{ experience_id: string; start_local: string; end_local: string | null; remaining: number }>((f, t) =>
        db.from('experience_slots_local').select('experience_id, start_local, end_local, remaining').in('experience_id', ids).order('starts_at').order('id').range(f, t),
      )
    : [];

  const previous = past
    .map((p) => p.reservation)
    .filter((r): r is NonNullable<typeof r> => Boolean(r?.voyage) && r!.id !== reservationId && r!.status !== 'cancelled' && (r!.status === 'completed' || r!.voyage!.end_date < today));
  const p = prefs ?? {};
  const companionTags = signals.filter((s) => s.kind === 'travel-companions').flatMap((s) => s.value.tags ?? []).filter((t) => t !== 'couple');

  return {
    bonvoy: membership ? { tier: membership.tier as NonNullable<PersonalizationInput['bonvoy']>['tier'] } : null,
    previousVoyages: previous.map((r) => ({ id: r.voyage!.id, name: r.voyage!.name, region: r.voyage!.region ?? '', startDate: r.voyage!.start_date })),
    history: signals.flatMap((s, i) => {
      const kind = HISTORY[s.kind];
      if (!kind) return [];
      return [{ id: s.value.ref ?? `sig_${i}`, kind, memory: s.value.memory, category: s.value.category, voyageId: s.value.voyageId, rating: s.value.rating, weight: Number(s.weight), tags: s.value.tags ?? [] }];
    }),
    destinationsVisited: signals.filter((s) => s.kind === 'destinations-visited').flatMap((s) => (s.value.summary ?? '').split(',')).map((x) => x.trim().toLowerCase()).filter(Boolean),
    voyage: { id: voyageId, yachtName: res.voyage.yacht?.name ?? 'the yacht', startDate: res.voyage.start_date, endDate: res.voyage.end_date },
    itinerary: ports.map((x) => ({ id: x.id, day: x.day, date: x.call_date, type: x.type, portName: x.port_name, country: x.country })),
    catalogue: catalogue.map((e) => ({ id: e.id, title: e.title, category: e.category, portCallId: e.port_call_id ?? undefined, destination: e.destination ?? undefined, durationMinutes: e.duration_minutes ?? undefined, format: e.format, privateAvailable: e.private_available, tags: e.tags ?? [] })),
    slots: slots.map((s) => ({ experienceId: s.experience_id, start: s.start_local, end: s.end_local ?? undefined, remaining: s.remaining })),
    soldOut: catalogue.filter((e) => e.availability_status === 'unavailable').map((e) => e.id),
    preferences: {
      dining: { cuisines: p.dining?.cuisines ?? [], tablePreference: p.dining?.tablePreference, preferredTime: p.dining?.preferredTime },
      wine: p.beverage?.wine ?? [],
      spa: { favouriteTreatments: p.spa?.favouriteTreatments ?? [], pressure: p.spa?.pressure, preferredTime: p.spa?.preferredTime },
      excursions: { style: p.excursions?.style ?? 'any', pace: p.excursions?.pace, maxDurationMinutes: p.excursions?.maxDurationMinutes },
      activityInterests: p.activity_interests ?? [],
      preferredDestinations: p.preferred_destinations ?? [],
      mobility: p.accessibility?.mobility ?? 'none',
      personalisedRecommendations: p.privacy?.personalisedRecommendations !== false,
    },
    companions: companions.map((c) => ({ firstName: c.first_name, relationship: c.relationship, isMinor: c.is_minor, interests: companionTags })),
    occasions: occasions.map((o) => ({ id: o.id, type: o.type, label: o.label, date: o.occasion_date, recognition: o.recognition })),
    bookings: bookings.map((b) => ({ id: b.id, experienceId: b.experience_id, category: b.category, start: b.start_local, end: b.end_local ?? undefined, status: b.status })),
    valueSegment: (relationship?.value_segment ?? undefined) as PersonalizationInput['valueSegment'],
  };
}
