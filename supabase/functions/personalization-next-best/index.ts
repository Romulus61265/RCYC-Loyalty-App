// POST /personalization-next-best { guestId, reservationId, surface }
//
// MVP: transparent weighted scoring over signals in Postgres.
// Target: the same contract fronted by an enterprise decisioning / ML
// platform (feature store + model serving). See docs/10-personalization-architecture.md.
import { audit, handle, HttpError, json, requireCaller, serviceClient } from '../_shared/auth.ts';

const MODEL_VERSION = 'rules-v0.1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACES = ['home', 'discover', 'concierge', 'voyage'];

// Signal weights — tuned by hospitality leadership, not by engagement maximisation.
const W = {
  occasion: 0.30,
  history: 0.20,
  preference: 0.20,
  itineraryFit: 0.15,
  companion: 0.10,
  recovery: 0.05,
};

interface Candidate {
  id: string;
  category: string;
  title: string;
  tags: string[];
  port_call_id: string | null;
}

Deno.serve(
  handle(async (req) => {
    const caller = await requireCaller(req);
    const { guestId, reservationId, surface = 'home' } = (await req.json()) as { guestId: string; reservationId: string; surface?: string };
    if (!UUID.test(guestId ?? '') || !UUID.test(reservationId ?? '') || !SURFACES.includes(surface)) throw new HttpError(422, 'validation');
    const isCrew = caller.roles.some((r) => r !== 'guest' && r !== 'travel_companion');

    // Authorise through the caller's RLS scope before any service-role read:
    // the reservation must be visible to the caller, the guest must be on it,
    // and a guest may only score themselves (crew may score their guests).
    const { data: reservation } = await caller.db.from('reservations').select('voyage_id').eq('id', reservationId).single();
    if (!reservation) throw new HttpError(404, 'not_found');
    const { data: member } = await caller.db.from('reservation_guests').select('guest_id').eq('reservation_id', reservationId).eq('guest_id', guestId).maybeSingle();
    if (!member) throw new HttpError(404, 'not_found');
    if (!isCrew) {
      const { data: self } = await caller.db.rpc('current_guest_id');
      if (self !== guestId) throw new HttpError(403, 'forbidden');
    }

    const svc = serviceClient();
    const [{ data: candidates }, { data: signals }, { data: occasions }, { data: prefs }] = await Promise.all([
      svc.from('experiences').select('id, category, title, tags, port_call_id').or(`voyage_id.eq.${reservation.voyage_id},voyage_id.is.null`).eq('active', true),
      svc.from('personalization_signals').select('kind, value, weight').eq('guest_id', guestId),
      svc.from('guest_occasions').select('type, occasion_date').eq('guest_id', guestId),
      svc.from('guest_preferences').select('activity_interests, dining').eq('guest_id', guestId).maybeSingle(),
    ]);

    const interests = new Set<string>((prefs?.activity_interests ?? []).map((s: string) => s.toLowerCase()));
    const lovedCategories = new Set((signals ?? []).filter((s) => s.kind.endsWith('-history') && (s.value as { rating?: number }).rating! >= 4).map((s) => (s.value as { category: string }).category));
    const hasOccasion = (occasions ?? []).length > 0;

    const scored = (candidates as Candidate[] ?? []).map((c) => {
      const drivers: string[] = [];
      let score = 0;
      if (hasOccasion && c.tags.includes('occasion')) { score += W.occasion; drivers.push('special-occasion'); }
      if (lovedCategories.has(c.category)) { score += W.history; drivers.push(`${c.category}-history`); }
      if (c.tags.some((t) => interests.has(t))) { score += W.preference; drivers.push('suite-preference'); }
      if (c.port_call_id) { score += W.itineraryFit; drivers.push('future-itinerary'); }
      if (c.tags.includes('couples')) { score += W.companion; drivers.push('travel-companions'); }
      return { c, score, drivers };
    });

    const top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    const rows = top.map(({ c, score, drivers }) => ({
      guest_id: guestId,
      reservation_id: reservationId,
      surface,
      kind: 'experience',
      experience_id: c.id,
      title: c.title,
      rationale: rationaleFor(drivers),
      score: Number(score.toFixed(4)),
      drivers,
      audience: 'guest',
      model_version: MODEL_VERSION,
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
    }));
    if (rows.length) await svc.from('recommendations').insert(rows);

    await audit({ actorId: caller.userId, actorRoles: caller.roles, action: 'personalization.score', resource: 'guest', resourceId: guestId, outcome: 'success', metadata: { surface, count: rows.length, isCrew } });
    return json({ recommendations: rows });
  }),
);

function rationaleFor(drivers: string[]): string {
  if (drivers.includes('special-occasion')) return 'Something to mark your celebration.';
  if (drivers.some((d) => d.endsWith('-history'))) return 'Inspired by what you enjoyed on a previous voyage.';
  if (drivers.includes('future-itinerary')) return 'Perfectly timed for your days ashore.';
  return 'Chosen with your interests in mind.';
}
