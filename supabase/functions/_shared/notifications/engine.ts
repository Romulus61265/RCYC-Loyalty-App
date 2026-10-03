// Contextual notifications engine.
//
// Pure and deterministic: candidates come only from the guest's own data (no
// clock: `inbox`, `upcoming` and `dueForPush` take the moment explicitly). Each has a stable key, so the app (inbox) and the
// server (push) agree on what was said, and nothing is sent twice.
//
// Types and where they come from:
//   reminder         a booking about to begin; all aboard on a day ashore
//   service-update   a request acknowledged, in progress, needing a reply,
//                    resolved; the transfer driver about to arrive
//   reservation      server-sent booking news (confirmed, requested)
//   itinerary-change a programme item or booking whose time has moved
//   urgent           urgent alerts (weather, tender, safety); always delivered
//   recommendation   one actionable idea for a coming port day
//   information      arrival in a port; informational messages from the server
import type {
  CandidateNotification,
  DecidedNotification,
  NotificationDelivery,
  NotificationPreferences,
  NotificationType,
  NotifyBooking,
  NotifyInput,
  StoredNotification,
} from './types.ts';

export const NOTIFICATION_TYPES: NotificationType[] = ['information', 'reminder', 'service-update', 'reservation', 'itinerary-change', 'urgent', 'recommendation'];

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  delivery: {
    information: 'in-app',
    reminder: 'push',
    'service-update': 'push',
    reservation: 'push',
    'itinerary-change': 'push',
    urgent: 'push',
    recommendation: 'in-app',
  },
  timeFormat: '24h',
  reminderLead: 'standard',
};

/** 12-hour for US English, 24-hour otherwise; the guest can change it. */
export function defaultPreferencesFor(language: string | undefined): NotificationPreferences {
  return { ...DEFAULT_PREFERENCES, delivery: { ...DEFAULT_PREFERENCES.delivery }, timeFormat: /^en-(US|CA|AU|PH)$/i.test(language ?? '') ? '12h' : '24h' };
}

// ─── Time ──────────────────────────────────────────────────────────────────

const offsetOf = (iso: string) => /([+-]\d{2}:\d{2}|Z)$/.exec(iso)?.[1] ?? 'Z';
const offsetMinutes = (off: string) => (off === 'Z' ? 0 : (off.startsWith('-') ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6))));

/** Shifts a local ISO time by minutes, keeping its offset. */
export function shift(iso: string, minutes: number): string {
  const off = offsetOf(iso);
  const local = new Date(Date.parse(iso) + (offsetMinutes(off) + minutes) * 60_000).toISOString().slice(0, 19);
  return `${local}${off === 'Z' ? '+00:00' : off}`;
}

/** A local wall-clock time on the same day as `iso`, in its offset. */
const atLocal = (iso: string, hhmm: string) => `${iso.slice(0, 10)}T${hhmm}:00${offsetOf(iso) === 'Z' ? '+00:00' : offsetOf(iso)}`;

export function clock(iso: string, format: NotificationPreferences['timeFormat']): string {
  const hh = Number(iso.slice(11, 13));
  const mm = iso.slice(14, 16);
  if (format === '24h') return `${String(hh).padStart(2, '0')}:${mm}`;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "Tomorrow's", "Today's", "Saturday's", relative to when the guest reads it. */
function whose(date: string, readOn: string): string {
  if (date === readOn) return 'Today’s';
  if (date === addDays(readOn, 1)) return 'Tomorrow’s';
  return `${weekday(date)}’s`;
}

// ─── Rules ─────────────────────────────────────────────────────────────────

const ACTIVE = (b: NotifyBooking) => b.status === 'confirmed' || b.status === 'in_progress';
const SHORE = new Set(['excursion', 'culture', 'wine', 'private', 'wellness', 'shopping', 'marina']);

/** Minutes before a booking that its reminder goes out. */
function leadFor(category: string, lead: NotificationPreferences['reminderLead']): number {
  const base = category === 'dining' ? 120 : category === 'spa' ? 60 : 60;
  return lead === 'early' ? base * 2 : base;
}

/** "marina activity", "Couples Terrace Ritual". */
function subjectOf(title: string, category?: string): string {
  return category === 'marina' ? 'marina activity' : title;
}

/** "A private wine experience is available in Mallorca." */
function recommendationLine(category: string, destination: string): string {
  const what: Record<string, string> = {
    wine: 'private wine experience',
    culture: 'private cultural visit',
    excursion: 'private excursion',
    private: 'private experience',
    wellness: 'private wellness experience',
    marina: 'experience at sea',
    shopping: 'private appointment',
    dining: 'private table',
    spa: 'spa treatment',
  };
  const place = destination.replace(/^Palma de Mallorca$/, 'Mallorca');
  return `A ${what[category] ?? 'private experience'} is available ${/^Aboard /.test(place) ? place.charAt(0).toLowerCase() + place.slice(1) : `in ${place}`}.`;
}

const TYPE_OF_CATEGORY: Record<string, NotificationType> = {
  'pre-voyage': 'information',
  travel: 'information',
  onboard: 'information',
  reservation: 'reservation',
  concierge: 'service-update',
  occasion: 'information',
  'post-voyage': 'information',
};

/** Only internal routes; anything else is dropped. */
export function safeRoute(route: string | undefined): string | undefined {
  if (!route) return undefined;
  return /^\/(?:$|[a-z][a-z0-9/_?=&%.:-]*$)/i.test(route) && !route.startsWith('//') ? route : undefined;
}

export function buildCandidates(input: NotifyInput, prefs: NotificationPreferences): CandidateNotification[] {
  const fmt = (iso: string) => clock(iso, prefs.timeFormat);
  const out: CandidateNotification[] = [];
  const push = (n: CandidateNotification) => out.push(n);

  // Reminders and the driver, from bookings.
  for (const b of input.bookings.filter(ACTIVE)) {
    if (b.category === 'transfer') {
      push({
        key: `transfer:${b.id}:arriving`,
        type: 'service-update',
        title: 'Your transfer driver will arrive in 20 minutes.',
        body: `${b.title}: ${b.venue}.`,
        at: shift(b.start, -20),
        expiresAt: shift(b.start, 30),
        deepLink: '/voyage?section=embarkation',
        timeSensitive: true,
        source: { kind: 'transfer', id: b.id },
      });
      continue;
    }
    const venue = b.venue.split(',')[0]!.trim();
    const title = b.category === 'dining' ? `Dinner at ${venue} begins at ${fmt(b.start)}.` : `Coming up at ${fmt(b.start)}: ${b.title}.`;
    push({
      key: `reminder:${b.id}`,
      type: 'reminder',
      title,
      body: b.category === 'dining' ? 'Your table is ready for you.' : `Meet at ${b.venue}.`,
      at: shift(b.start, -leadFor(b.category, prefs.reminderLead)),
      expiresAt: b.start,
      deepLink: '/voyage?section=calendar',
      timeSensitive: false,
      source: { kind: 'booking', id: b.id },
    });
  }

  // All aboard, on a day the guest has plans ashore.
  for (const d of input.itinerary) {
    if (!['port', 'tender', 'overnight'].includes(d.type)) continue;
    const ashore = input.bookings.some((b) => ACTIVE(b) && b.start.slice(0, 10) === d.date && SHORE.has(b.category));
    if (ashore && d.allAboard) {
      push({
        key: `all-aboard:${d.id}`,
        type: 'reminder',
        title: `All aboard is at ${fmt(d.allAboard)}.`,
        body: `${d.portName}, day ${d.day}. Your tender or car will be ready in good time.`,
        at: shift(d.allAboard, prefs.reminderLead === 'early' ? -120 : -90),
        expiresAt: d.allAboard,
        deepLink: '/voyage?section=itinerary',
        timeSensitive: false,
        source: { kind: 'port', id: d.id },
      });
    }
    if (d.arrival) {
      push({
        key: `arrival:${d.id}`,
        type: 'information',
        title: `Welcome to ${d.portName}.`,
        body: d.allAboard ? `All aboard is at ${fmt(d.allAboard)}.` : 'Your day ashore begins.',
        at: d.arrival,
        expiresAt: d.allAboard,
        deepLink: '/voyage?section=itinerary',
        timeSensitive: false,
        source: { kind: 'port', id: d.id },
      });
    }
  }

  // Itinerary changes: a programme item whose time has moved.
  for (const a of input.activities) {
    if (!a.previousStart || !a.changedAt || a.previousStart === a.start) continue;
    push({
      key: `moved:${a.id}:${a.start}`,
      type: 'itinerary-change',
      title: `${whose(a.start.slice(0, 10), a.changedAt.slice(0, 10))} ${subjectOf(a.title, a.category)} has moved to ${fmt(a.start)}.`,
      body: `${a.title}, ${a.location}. It was at ${fmt(a.previousStart)}.`,
      at: a.changedAt,
      expiresAt: a.start,
      deepLink: '/voyage?section=calendar',
      timeSensitive: false,
      source: { kind: 'activity', id: a.id },
    });
  }

  // Service updates: each step a request takes after it was sent.
  for (const r of input.requests) {
    const who = r.person ?? r.team;
    for (const step of r.timeline) {
      if (step.status === 'submitted') continue;
      if (step.status === 'closed' && !r.timeline.some((t) => t.status === 'resolved')) continue; // withdrawn: the guest knows
      if (step.status === 'closed') continue; // closed after resolution: nothing new to say
      const text =
        step.status === 'acknowledged'
          ? { title: `${who.split(',')[0]} has your request.`, body: r.title }
          : step.status === 'in_progress'
            ? r.awaitingGuest && step === r.timeline[r.timeline.length - 1]
              ? { title: `${who.split(',')[0]} needs your reply.`, body: r.title }
              : { title: `Under way: ${r.title}`, body: `${who} is taking care of it.` }
            : { title: `Done: ${r.title}`, body: r.resolutionNotes ?? 'Your request is complete.' };
      push({ key: `request:${r.id}:${step.status}`, type: 'service-update', ...text, at: step.at, deepLink: `/requests/${r.id}`, timeSensitive: false, source: { kind: 'request', id: r.id } });
    }
  }

  // Urgent alerts (weather, tenders, safety) always become notifications. Other
  // alerts are attention cards on Home; when they warrant a message, the server
  // has sent it (a stored notification with the alert's key).
  for (const a of input.alerts.filter((x) => x.severity === 'urgent')) {
    push({ key: `alert:${a.id}`, type: 'urgent', title: a.title, body: a.body, at: a.createdAt, expiresAt: a.expiresAt, deepLink: safeRoute(a.route), timeSensitive: true, source: { kind: 'alert', id: a.id } });
  }

  // One idea per coming port day, the evening before, and no more than three.
  if (input.guest.personalisedRecommendations) {
    const seenDays = new Set<string>();
    const picks = input.recommendations
      .filter((r) => r.actionable && input.itinerary.some((d) => d.date === r.voyageDate && d.type !== 'sea'))
      .filter((r) => (seenDays.has(r.voyageDate) ? false : (seenDays.add(r.voyageDate), true)))
      .slice(0, 3);
    for (const r of picks) {
      const day = input.itinerary.find((d) => d.date === r.voyageDate)!;
      const eve = shift(atLocal(day.arrival ?? day.allAboard ?? `${r.voyageDate}T12:00:00+00:00`, '18:00'), -24 * 60);
      push({
        key: `recommendation:${r.experienceId}`,
        type: 'recommendation',
        title: recommendationLine(r.category, r.destination),
        body: `${r.recommendation}, ${weekday(r.voyageDate)}. ${r.reason}`,
        at: eve,
        expiresAt: `${r.voyageDate}T12:00:00${offsetOf(eve)}`,
        deepLink: `/discover`,
        timeSensitive: false,
        source: { kind: 'recommendation', id: r.experienceId },
      });
    }
  }

  // What the server has already sent (or will): its own words, not regenerated.
  const sentKeys = new Set(input.stored.map((s) => s.dedupeKey).filter(Boolean));
  const generated = out.filter((n) => !sentKeys.has(n.key));
  const stored = input.stored.map((s): CandidateNotification => storedCandidate(s));
  return [...stored, ...generated].sort(byAt);
}

function storedCandidate(s: StoredNotification): CandidateNotification {
  const type = s.type ?? TYPE_OF_CATEGORY[s.category] ?? 'information';
  return {
    key: s.dedupeKey ?? `stored:${s.id}`,
    type,
    title: s.title,
    body: s.body,
    at: s.deliveredAt ?? s.scheduledFor,
    deepLink: safeRoute(s.deepLink),
    timeSensitive: s.bypassQuietHours || type === 'urgent',
    source: { kind: 'stored', id: s.id },
    ...(s.readAt ? { readAt: s.readAt } : {}),
  };
}

const byAt = (a: CandidateNotification, b: CandidateNotification) => Date.parse(a.at) - Date.parse(b.at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// ─── Preferences and quiet hours ───────────────────────────────────────────

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Is this local moment inside quiet hours (which may wrap past midnight)? */
export function inQuietHours(iso: string, quiet: { start: string; end: string } | undefined): boolean {
  if (!quiet) return false;
  const t = minutesOf(iso.slice(11, 16));
  const s = minutesOf(quiet.start);
  const e = minutesOf(quiet.end);
  return s === e ? false : s < e ? t >= s && t < e : t >= s || t < e;
}

/** The end of the quiet period containing `iso`, in its offset. */
export function quietEnd(iso: string, quiet: { start: string; end: string }): string {
  const end = atLocal(iso, quiet.end);
  return Date.parse(end) > Date.parse(iso) ? end : shift(end, 24 * 60);
}

export function decide(candidates: CandidateNotification[], input: NotifyInput, prefs: NotificationPreferences): DecidedNotification[] {
  return candidates.map((n) => {
    // Urgent is never switched off or held.
    let delivery: NotificationDelivery = n.type === 'urgent' ? 'push' : prefs.delivery[n.type];
    let reason: DecidedNotification['reason'];
    if (n.type === 'recommendation' && !input.guest.personalisedRecommendations) {
      delivery = 'off';
      reason = 'privacy';
    } else if (delivery === 'off') reason = 'type-off';
    if (delivery === 'push' && !input.guest.pushChannel && n.type !== 'urgent') {
      delivery = 'in-app';
      reason = 'push-disabled';
    }
    let deliverAt = n.at;
    if (delivery === 'push' && !n.timeSensitive && inQuietHours(n.at, input.guest.quietHours)) {
      deliverAt = quietEnd(n.at, input.guest.quietHours!);
      reason = 'quiet-hours';
      // Held past its moment, it is no longer worth a push; the inbox keeps it.
      if (n.expiresAt && Date.parse(deliverAt) >= Date.parse(n.expiresAt)) delivery = 'in-app';
    }
    return { ...n, delivery, deliverAt, ...(reason ? { reason } : {}) };
  });
}

/** Everything the engine knows, decided: the inbox shows what is due; push sends what is due and 'push'. */
export function contextualNotifications(input: NotifyInput, prefs: NotificationPreferences): DecidedNotification[] {
  return decide(buildCandidates(input, prefs), input, prefs);
}

/** Due at `now` and not switched off: the inbox. Newest first. */
export function inbox(all: DecidedNotification[], now: Date): DecidedNotification[] {
  return all.filter((n) => n.delivery !== 'off' && Date.parse(n.at) <= now.getTime()).sort((a, b) => -byAt(a, b));
}

/** Pushes still to come, soonest first (what the dispatcher will send). */
export function upcoming(all: DecidedNotification[], now: Date): DecidedNotification[] {
  return all.filter((n) => n.delivery === 'push' && Date.parse(n.deliverAt) > now.getTime()).sort((a, b) => Date.parse(a.deliverAt) - Date.parse(b.deliverAt) || (a.key < b.key ? -1 : 1));
}

/** Pushes due in (since, until]: the dispatcher's window. */
export function dueForPush(all: DecidedNotification[], since: Date, until: Date): DecidedNotification[] {
  return all.filter((n) => n.delivery === 'push' && n.source.kind !== 'stored' && Date.parse(n.deliverAt) > since.getTime() && Date.parse(n.deliverAt) <= until.getTime() && (!n.expiresAt || Date.parse(n.expiresAt) > until.getTime()));
}
