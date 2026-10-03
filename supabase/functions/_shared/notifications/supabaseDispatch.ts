// The dispatcher's ports over Supabase (service role). It loads the same
// inputs the app's NotificationService uses, from the same views, so the
// server decides exactly what the guest's inbox shows; and it records each
// push once, keyed by the engine's dedupe key.
import { loadPersonalizationInput, type Db as PersonalizationDb } from '../personalization/supabaseInputs.ts';
import { personalize } from '../personalization/engine.ts';
import { categoryFromType, statusOf, teamLabel, timelineOf, type Category, type RequestStatus, type Team } from '../requests/rules.ts';
import { defaultPreferencesFor } from './engine.ts';
import type { DispatchPorts, GuestToNotify } from './dispatch.ts';
import type { NotificationPreferences, NotifyInput } from './types.ts';

// deno-lint-ignore no-explicit-any
type Query = any;
export interface Db extends PersonalizationDb {
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

const DAY = 86_400_000;

export function supabaseDispatchPorts(db: Db): DispatchPorts {
  return {
    async guests(now) {
      const devices = await rows<{ guest_id: string }>(db.from('push_devices').select('guest_id').eq('enabled', true));
      const ids = [...new Set(devices.map((d) => d.guest_id))];
      if (!ids.length) return [];
      const party = await rows<{ guest_id: string; reservation: { id: string; status: string; voyage: { start_date: string; end_date: string } | null } | null }>(
        db.from('reservation_guests').select('guest_id, reservation:reservations(id, status, voyage:voyages(start_date, end_date))').in('guest_id', ids),
      );
      const from = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
      const to = new Date(now.getTime() + 3 * DAY).toISOString().slice(0, 10);
      // In progress, or beginning within three days (transfers, check-in, embarkation).
      return party
        .filter((p) => p.reservation?.voyage && p.reservation.status !== 'cancelled' && p.reservation.voyage.start_date <= to && p.reservation.voyage.end_date >= from)
        .map((p) => ({ guestId: p.guest_id, reservationId: p.reservation!.id }));
    },

    async load(g: GuestToNotify, now: Date) {
      const res = await row<{ voyage_id: string; voyage: { start_date: string; end_date: string } | null }>(db.from('reservations').select('voyage_id, voyage:voyages(start_date, end_date)').eq('id', g.reservationId).maybeSingle());
      if (!res?.voyage) return null;
      const today = now.toISOString().slice(0, 10);
      const where: 'home' | 'aboard' = today >= res.voyage.start_date && today <= res.voyage.end_date ? 'aboard' : 'home';
      const [guest, prefs, ports, bookings, activities, requests, alerts, sent] = await Promise.all([
        row<{ preferred_name: string | null; first_name: string }>(db.from('guests').select('preferred_name, first_name').eq('id', g.guestId).maybeSingle()),
        // deno-lint-ignore no-explicit-any
        row<{ communication: any; privacy: any }>(db.from('guest_preferences').select('communication, privacy').eq('guest_id', g.guestId).maybeSingle()),
        rows<{ id: string; day: number; call_date: string; type: string; port_name: string; arrival: string | null; all_aboard: string | null; time_zone: string }>(
          db.from('port_calls_local').select('id, day, call_date, type, port_name, arrival, all_aboard, time_zone').eq('voyage_id', res.voyage_id).order('day'),
        ),
        rows<{ id: string; title: string; category: string; venue: string | null; start_local: string; end_local: string | null; status: string }>(
          db.from('experience_bookings_local').select('id, title, category, venue, start_local, end_local, status').eq('reservation_id', g.reservationId).order('starts_at'),
        ),
        rows<{ id: string; title: string; category: string | null; location: string | null; start_local: string; previous_start_local: string | null; changed_local: string | null; kind: string }>(
          db.from('activities_local').select('id, title, category, location, start_local, previous_start_local, changed_local, kind').eq('voyage_id', res.voyage_id).or(`reservation_id.is.null,reservation_id.eq.${g.reservationId}`),
        ),
        rows<{ id: string; type: string; category: Category | null; summary: string; status: RequestStatus; assigned_team: Team; assigned_to_name: string | null; resolution_notes: string | null; created_at: string; updated_at: string; acknowledged_at: string | null; started_at: string | null; resolved_at: string | null; closed_at: string | null }>(
          db.from('service_requests_local').select('id, type, category, summary, status, assigned_team, assigned_to_name, resolution_notes, created_at, updated_at, acknowledged_at, started_at, resolved_at, closed_at').eq('reservation_id', g.reservationId),
        ),
        rows<{ id: string; severity: 'info' | 'notice' | 'action' | 'urgent'; title: string; body: string; created_at: string; expires_at: string | null; action_route: string | null; action_label: string | null }>(
          db.from('journey_alerts_local').select('id, severity, title, body, created_at, expires_at, action_route, action_label').eq('reservation_id', g.reservationId),
        ),
        rows<{ id: string; type: NotifyInput['stored'][number]['type'] | null; category: string; title: string; body: string; scheduled_for: string; delivered_at: string | null; read_at: string | null; deep_link: string | null; bypass_quiet_hours: boolean; dedupe_key: string | null }>(
          db.from('notifications_local').select('id, type, category, title, body, scheduled_for, delivered_at, read_at, deep_link, bypass_quiet_hours, dedupe_key').eq('guest_id', g.guestId).or(`reservation_id.is.null,reservation_id.eq.${g.reservationId}`),
        ),
      ]);

      const c = prefs?.communication ?? {};
      const defaults = defaultPreferencesFor(c.language);
      const chosen = c.notifications as NotificationPreferences | undefined;
      const preferences: NotificationPreferences = chosen ? { ...defaults, ...chosen, delivery: { ...defaults.delivery, ...chosen.delivery, urgent: 'push' } } : defaults;
      const personalised = prefs?.privacy?.personalisedRecommendations !== false;

      const recommendations = personalised
        ? await loadPersonalizationInput(db, g.guestId, g.reservationId, today)
            .then((input) => (input ? personalize(input, { limit: 10, now: now.toISOString() }) : []))
            .catch(() => [])
        : [];

      const input: NotifyInput = {
        guest: { firstName: guest?.preferred_name ?? guest?.first_name ?? 'Guest', pushChannel: c.channels?.push !== false, quietHours: c.quietHours, personalisedRecommendations: personalised },
        itinerary: ports.map((p) => ({ id: p.id, day: p.day, date: p.call_date, type: p.type, portName: p.port_name, arrival: p.arrival ?? undefined, allAboard: p.all_aboard ?? undefined })),
        bookings: bookings.map((b) => ({ id: b.id, title: b.title, category: b.category, venue: b.venue ?? '', start: b.start_local, end: b.end_local ?? undefined, status: b.status })),
        activities: activities
          .filter((a) => a.kind !== 'port')
          .map((a) => ({ id: a.id, title: a.title, category: a.category ?? undefined, location: a.location ?? '', start: a.start_local, previousStart: a.previous_start_local ?? undefined, changedAt: a.changed_local ?? undefined })),
        requests: requests.map((r) => {
          const stamps = { status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, acknowledgedAt: r.acknowledged_at ?? undefined, startedAt: r.started_at ?? undefined, resolvedAt: r.resolved_at ?? undefined, closedAt: r.closed_at ?? undefined };
          const status = statusOf(stamps);
          return {
            id: r.id,
            title: r.summary,
            status,
            awaitingGuest: r.status === 'awaiting_guest' && status === 'in_progress',
            team: teamLabel(r.category ?? categoryFromType(r.type), r.assigned_team, where),
            person: r.assigned_to_name ?? undefined,
            resolutionNotes: r.resolution_notes ?? undefined,
            timeline: timelineOf(stamps),
          };
        }),
        alerts: alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, body: a.body, createdAt: a.created_at, expiresAt: a.expires_at ?? undefined, route: a.action_route ?? undefined, actionLabel: a.action_label ?? undefined })),
        recommendations: recommendations.map((r) => ({ experienceId: r.experienceId, recommendation: r.recommendation, category: r.category, destination: r.destination, voyageDate: r.voyageDate, reason: r.reason, actionable: !r.booked && r.action.kind !== 'open' })),
        stored: sent.map((n) => ({
          id: n.id,
          type: n.type ?? undefined,
          category: n.category,
          title: n.title,
          body: n.body,
          scheduledFor: n.scheduled_for,
          deliveredAt: n.delivered_at ?? undefined,
          readAt: n.read_at ?? undefined,
          deepLink: n.deep_link ?? undefined,
          bypassQuietHours: n.bypass_quiet_hours,
          dedupeKey: n.dedupe_key ?? undefined,
        })),
      };
      const zoneByDate = new Map(ports.map((p) => [p.call_date, p.time_zone]));
      return { input, prefs: preferences, zoneFor: (iso: string) => zoneByDate.get(iso.slice(0, 10)) ?? 'UTC' };
    },

    async sentKeys(guestId, keys) {
      if (!keys.length) return new Set();
      const found = await rows<{ dedupe_key: string }>(db.from('notifications').select('dedupe_key').eq('guest_id', guestId).in('dedupe_key', keys));
      return new Set(found.map((f) => f.dedupe_key));
    },

    devices(guestId) {
      return rows<{ id: string; token: string }>(db.from('push_devices').select('id, token').eq('guest_id', guestId).eq('enabled', true));
    },

    async record(list) {
      for (const { g, n, status, ticket, zone, sentAt } of list) {
        const { error } = await db.from('notifications').insert({
          guest_id: g.guestId,
          reservation_id: g.reservationId,
          channel: 'push',
          category: n.type === 'reservation' ? 'reservation' : n.type === 'service-update' && n.source.kind === 'request' ? 'concierge' : n.source.kind === 'transfer' ? 'travel' : 'onboard',
          type: n.type,
          title: n.title.slice(0, 200),
          body: n.body.slice(0, 1000),
          deep_link: n.deepLink ?? null,
          scheduled_for: n.at,
          delivered_at: sentAt.toISOString(),
          bypass_quiet_hours: n.timeSensitive,
          dedupe_key: n.key,
          push_status: status,
          push_ticket: ticket ?? null,
          time_zone: zone,
        });
        // Another run recorded it first: fine, it was sent once.
        if (error && error.code !== '23505') throw new Error(error.message);
      }
    },

    async disableDevice(deviceId, reason) {
      const { error } = await db.from('push_devices').update({ enabled: false, disabled_reason: reason }).eq('id', deviceId);
      if (error) throw new Error(error.message);
    },
  };
}
