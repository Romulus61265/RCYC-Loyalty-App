// POST /personalization-next-best { guestId, reservationId, limit?, includeBooked? }
//
// Runs the deterministic rules-based engine (_shared/personalization) on
// inputs read server-side, and returns PersonalizedRecommendation[]. For
// guests, internal signals (the value segment) are stripped; relevanceScore
// ranks and is never displayed. Target: the same contract fronted by an
// enterprise decisioning / ML platform. See docs/10-personalization-architecture.md.
import { audit, handle, HttpError, json, requireCaller, serviceClient, type AppRole } from '../_shared/auth.ts';
import { handleNextBest } from '../_shared/personalization/handler.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const caller = await requireCaller(req);
    const result = await handleNextBest(await req.text(), caller, {
      user: caller.db,
      service: serviceClient(),
      audit: (entry) => audit({ ...entry, actorRoles: entry.actorRoles as AppRole[] }),
      now: () => new Date(),
    });
    return json(result.body, result.status);
  }),
);
