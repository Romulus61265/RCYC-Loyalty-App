// POST /journey-events — inbound webhook from the enterprise event bus.
//
// Producers (flight-status feed, shore ops, shipboard PMS, concierge
// platform, CRM) publish normalised JourneyEvents to the integration bus;
// a bus subscriber forwards them here, HMAC-signed.
//
//  • Verify signature + timestamp (replay window 5 min).
//  • Idempotent insert on dedupe_key.
//  • Project to a calm, guest-facing JourneyAlert (or none).
//  • A disruption (cancellation, delay, port change, weather, suite issue,
//    missed service, complaint) is also recorded as a service recovery: its
//    plan for the crew, the guest's notice with alternatives, and any
//    goodwill proposals from approved rules (never applied automatically).
//  • Supabase Realtime pushes the alert to the guest app; crew consoles
//    subscribe to journey_events directly.
import { audit, handle, HttpError, json, serviceClient } from '../_shared/auth.ts';
import { fromJourneyEvent } from '../_shared/recovery/engine.ts';
import { processDisruption } from '../_shared/recovery/handler.ts';
import { supabaseRecoveryPorts } from '../_shared/recovery/supabaseRecovery.ts';

const SECRET = Deno.env.get('JOURNEY_EVENTS_HMAC_SECRET')!;

interface JourneyEvent {
  type: string;
  reservationId: string;
  guestIds: string[];
  occurredAt: string;
  severity: 'info' | 'notice' | 'action' | 'urgent';
  source: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method');
    const raw = await req.text();
    await verifySignature(req, raw);
    const event = JSON.parse(raw) as JourneyEvent;

    const svc = serviceClient();
    const { data: inserted, error } = await svc
      .from('journey_events')
      .upsert(
        {
          type: event.type,
          reservation_id: event.reservationId,
          guest_ids: event.guestIds,
          severity: event.severity,
          source: event.source,
          payload: event.payload,
          dedupe_key: event.dedupeKey,
          occurred_at: event.occurredAt,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();
    if (error) throw new HttpError(500, 'persist');
    if (!inserted) return json({ status: 'duplicate' }); // already processed

    // Recorded first, so the alert can open the guest's notice.
    const disruption = fromJourneyEvent(event);
    let noticeId: string | undefined;
    if (disruption) {
      const { data: policy } = await svc.from('goodwill_policy').select('financial_enabled').maybeSingle();
      const recovery = await processDisruption(supabaseRecoveryPorts(svc), disruption, { now: new Date(), journeyEventId: inserted.id, policy: { financialEnabled: policy?.financial_enabled === true } });
      noticeId = recovery.noticeId || undefined;
    }

    const alert = project(event, noticeId);
    if (alert) await svc.from('journey_alerts').insert({ event_id: inserted.id, event_type: event.type, reservation_id: event.reservationId, ...alert });
    await svc.from('journey_events').update({ processed_at: new Date().toISOString() }).eq('id', inserted.id);

    await audit({ action: 'journey_event.ingest', resource: 'journey_event', resourceId: inserted.id, outcome: 'success', metadata: { type: event.type, source: event.source, recovery: Boolean(noticeId) } });
    return json({ status: 'accepted', alert: Boolean(alert), recovery: Boolean(noticeId) }, 202);
  }),
);

async function verifySignature(req: Request, raw: string) {
  const ts = req.headers.get('X-Signature-Timestamp');
  const sig = req.headers.get('X-Signature');
  if (!ts || !sig || Math.abs(Date.now() - Number(ts) * 1000) > 300_000) throw new HttpError(401, 'signature');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`));
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (!timingSafeEqual(expected, sig)) throw new HttpError(401, 'signature');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type AlertDraft = { severity: JourneyEvent['severity']; title: string; body: string; handled?: string; action_label?: string; action_route?: string };

/**
 * Guest-facing projection. Tone rules: lead with what is already handled,
 * never alarm, always give one clear next step. Occasion events are
 * crew-only (no guest alert) so recognition stays a gesture, not a push.
 */
function project(e: JourneyEvent, noticeId?: string): AlertDraft | null {
  const p = e.payload as Record<string, string>;
  // A recorded recovery: the alert opens the notice, with its alternatives.
  const notice = noticeId ? { action_label: 'See alternatives', action_route: `/recovery/${noticeId}` } : null;
  switch (e.type) {
    case 'flight.delayed':
      return { severity: 'notice', title: `${p.flightNumber} is running late`, body: `Now expected at ${p.newArrivalLocal}.`, handled: 'Your driver has been informed and will meet you at the new time.' };
    case 'transfer.delayed':
      return { severity: 'notice', title: 'Your transfer is a little delayed', body: `New pick-up ${p.newPickupLocal}.`, handled: 'The yacht has been told — your embarkation is unaffected.', ...(notice ? { action_label: 'Details', action_route: notice.action_route } : {}) };
    case 'embarkation.changed':
      return { severity: 'action', title: 'Your embarkation details have changed', body: p.summary ?? 'Please review your new arrival window.', action_label: 'Review', action_route: '/voyage' };
    case 'dining.cancelled':
    case 'excursion.cancelled':
      return { severity: 'action', title: `${p.title} is no longer possible`, body: p.guestReason ?? p.reason ?? 'Circumstances have changed.', handled: 'Your concierge has prepared alternatives for you.', action_label: 'See alternatives', action_route: notice?.action_route ?? '/concierge' };
    case 'weather.disruption':
    case 'itinerary.port_changed':
      return { severity: 'notice', title: p.title ?? 'A change to our course', body: p.summary ?? '', handled: 'Your reservations ashore have been adjusted accordingly.', ...(notice ?? { action_label: 'View itinerary', action_route: '/voyage' }) };
    case 'suite.issue_reported':
    case 'service.missed':
    case 'guest.complaint':
      // Told through the recovery notice itself; no second card.
      return null;
    case 'service.request_updated':
      return { severity: 'info', title: p.summary ?? 'Your request has been updated', body: p.statusLabel ?? '' };
    case 'medical.assistance_requested':
      return { severity: 'urgent', title: 'Help is on the way', body: 'Our medical team has your request and is coming to you.' };
    case 'occasion.anniversary':
    case 'occasion.birthday':
      return null;
    default:
      return null;
  }
}
