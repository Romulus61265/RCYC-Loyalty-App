// POST /personalization-next-best handler, runtime-agnostic.
//
//   validate → authorise under the caller's RLS → load inputs (service role)
//   → engine → strip internal signals for guests → audit (no reasons, no values)
//
// Guests may score only themselves, and only on a reservation they are on.
// Crew may score guests on reservations they can see, and also receive the
// internal signals (for the crew console). Nothing is written except audit.
import { ENGINE_VERSION, personalize, toGuestSafe } from './engine.ts';
import { loadPersonalizationInput, type Db } from './supabaseInputs.ts';
import type { PersonalizedRecommendation } from './types.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = new Set(['guestId', 'reservationId', 'limit', 'includeBooked']);
const GUEST_ROLES = new Set(['guest', 'travel_companion']);

export interface NextBestCaller {
  userId: string;
  roles: string[];
}

export interface NextBestDeps {
  /** The caller's JWT: every authorisation read goes through RLS. */
  user: Db & { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
  /** Service role: reads the inputs guests cannot (history, value segment). */
  service: Db;
  audit(entry: { actorId: string; actorRoles: string[]; action: string; resource: string; resourceId?: string; outcome: 'success' | 'failure'; metadata: Record<string, unknown> }): Promise<void>;
  now(): Date;
}

export interface NextBestResult {
  status: number;
  body: { recommendations?: PersonalizedRecommendation[]; engineVersion?: string; error?: string };
}

export async function handleNextBest(raw: string, caller: NextBestCaller, deps: NextBestDeps): Promise<NextBestResult> {
  const fail = async (status: number, error: string, resourceId?: string): Promise<NextBestResult> => {
    await deps.audit({ actorId: caller.userId, actorRoles: caller.roles, action: 'personalization.next_best', resource: 'guest', resourceId, outcome: 'failure', metadata: { error, status } }).catch(() => undefined);
    return { status, body: { error } };
  };

  // Validation.
  if (raw.length > 4096) return fail(413, 'too_large');
  let b: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'invalid_body');
    b = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_json');
  }
  if (Object.keys(b).some((k) => !ALLOWED.has(k))) return fail(422, 'unknown_field');
  const { guestId, reservationId } = b;
  if (typeof guestId !== 'string' || !UUID.test(guestId)) return fail(422, 'guest_id');
  if (typeof reservationId !== 'string' || !UUID.test(reservationId)) return fail(422, 'reservation_id');
  const limit = b.limit === undefined ? 10 : b.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) return fail(422, 'limit');
  if (b.includeBooked !== undefined && typeof b.includeBooked !== 'boolean') return fail(422, 'include_booked');
  if (caller.roles.length === 0) return fail(403, 'forbidden', guestId);
  const isCrew = caller.roles.some((r) => !GUEST_ROLES.has(r));

  // Authorisation, under the caller's RLS, before any service-role read.
  const { data: reservation } = await deps.user.from('reservations').select('id').eq('id', reservationId).maybeSingle();
  if (!reservation) return fail(404, 'not_found', guestId);
  const { data: member } = await deps.user.from('reservation_guests').select('guest_id').eq('reservation_id', reservationId).eq('guest_id', guestId).maybeSingle();
  if (!member) return fail(404, 'not_found', guestId);
  if (!isCrew) {
    const { data: self } = await deps.user.rpc('current_guest_id');
    if (self !== guestId) return fail(403, 'forbidden', guestId);
  }

  const now = deps.now();
  const input = await loadPersonalizationInput(deps.service, guestId, reservationId, now.toISOString().slice(0, 10));
  if (!input) return fail(404, 'not_found', guestId);
  const all = personalize(input, { limit, includeBooked: b.includeBooked === true, now: now.toISOString() });
  const recommendations = isCrew ? all : toGuestSafe(all);

  // Decisions only: which rules and signal kinds, never reasons or values.
  await deps.audit({
    actorId: caller.userId,
    actorRoles: caller.roles,
    action: 'personalization.next_best',
    resource: 'guest',
    resourceId: guestId,
    outcome: 'success',
    metadata: {
      engineVersion: ENGINE_VERSION,
      reservationId,
      isCrew,
      count: recommendations.length,
      personalised: input.preferences.personalisedRecommendations,
      rules: [...new Set(all.flatMap((r) => r.rules))].sort(),
      signalKinds: [...new Set(all.flatMap((r) => r.sourceSignals.map((s) => s.kind)))].sort(),
    },
  });
  return { status: 200, body: { recommendations, engineVersion: ENGINE_VERSION } };
}
