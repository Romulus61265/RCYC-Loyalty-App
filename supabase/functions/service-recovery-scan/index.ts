// POST /service-recovery-scan
//
// Run on a schedule (every fifteen minutes, e.g. by pg_cron with the cron
// secret). Looks through the guests' own data for disruptions no
// operational system reports: a promised update that did not come, a fault
// in the suite, a request that reads as a complaint. Each is recorded once
// (by its key) with its plan, notice and goodwill proposals.
//
// Secrets: RECOVERY_CRON_SECRET (required). Guests cannot call this function.
import { handle, HttpError, json, serviceClient } from '../_shared/auth.ts';
import { scanReservation } from '../_shared/recovery/handler.ts';
import { reservationsToScan, supabaseRecoveryPorts } from '../_shared/recovery/supabaseRecovery.ts';
import { MVP_GOODWILL_POLICY } from '../_shared/recovery/types.ts';

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const secret = Deno.env.get('RECOVERY_CRON_SECRET');
    const given = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (!secret || !sameSecret(given, secret)) throw new HttpError(401, 'unauthenticated');

    const db = serviceClient();
    const now = new Date();
    const ports = supabaseRecoveryPorts(db);
    let recorded = 0;
    let reservations = 0;
    for (const r of await reservationsToScan(db, now)) {
      reservations += 1;
      // Financial goodwill stays off unless an admin has switched it on.
      const { data: policy } = await db.from('goodwill_policy').select('financial_enabled').maybeSingle();
      const results = await scanReservation(ports, r, { now, policy: { ...MVP_GOODWILL_POLICY, financialEnabled: policy?.financial_enabled === true } });
      recorded += results.filter((x) => x.status === 'recorded').length;
    }
    return json({ reservations, recorded });
  }),
);
