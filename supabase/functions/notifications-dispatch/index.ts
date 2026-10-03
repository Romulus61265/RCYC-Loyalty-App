// POST /notifications-dispatch { since?: ISO, until?: ISO }
//
// Run on a schedule (every five minutes, e.g. by pg_cron calling this with
// the cron secret). Sends the contextual notifications that have fallen due
// since the last window to every registered device, once each.
//
// Secrets: NOTIFICATIONS_CRON_SECRET (required), NOTIFICATIONS_PUSH_MODE
// = dry-run (default) | expo, EXPO_ACCESS_TOKEN (when Expo enhanced push
// security is on). Guests cannot call this function.
import { audit, handle, HttpError, json, serviceClient } from '../_shared/auth.ts';
import { dispatch, DryRunPushSender, ExpoPushSender } from '../_shared/notifications/dispatch.ts';
import { supabaseDispatchPorts } from '../_shared/notifications/supabaseDispatch.ts';

const WINDOW_MS = 15 * 60_000; // overlaps the schedule, so a late or failed run is caught up

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const secret = Deno.env.get('NOTIFICATIONS_CRON_SECRET');
    const given = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (!secret || !sameSecret(given, secret)) throw new HttpError(401, 'unauthenticated');

    const body = (await req.json().catch(() => ({}))) as { since?: string; until?: string };
    const until = body.until ? new Date(body.until) : new Date();
    const since = body.since ? new Date(body.since) : new Date(until.getTime() - WINDOW_MS);
    if (Number.isNaN(until.getTime()) || Number.isNaN(since.getTime()) || since >= until) throw new HttpError(422, 'window');

    const mode = Deno.env.get('NOTIFICATIONS_PUSH_MODE') ?? 'dry-run';
    const sender = mode === 'expo' ? new ExpoPushSender(Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined) : new DryRunPushSender();
    const summary = await dispatch(supabaseDispatchPorts(serviceClient()), sender, { since, until });
    await audit({ action: 'notifications.dispatch', resource: 'notifications', outcome: 'success', metadata: { mode: sender.name, since: since.toISOString(), until: until.toISOString(), ...summary } });
    return json(summary);
  }),
);
